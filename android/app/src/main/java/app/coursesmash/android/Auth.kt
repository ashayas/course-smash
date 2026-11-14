package app.coursesmash.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** A signed-in learner. The token goes to the Worker as `Authorization: Bearer <token>`. */
@Serializable
data class Session(val token: String, val username: String, val expiresAt: Long) {
    val isValid: Boolean get() = expiresAt > System.currentTimeMillis() / 1000
}

/**
 * What a learner hands over to prove who they are. Password is the only kind today.
 * Sign in with Google would add a subclass here and a matching branch in [AuthService].
 */
sealed interface Credential {
    data class Password(val username: String, val password: String) : Credential
}

/** Turns a credential into a session. The Worker does the checking. */
interface AuthService {
    suspend fun signIn(credential: Credential): Session
}

/** Where the session is kept between launches. */
interface SessionStorage {
    fun load(): Session?
    fun save(session: Session)
    fun clear()
}

class WorkerAuthService(private val api: ApiClient) : AuthService {
    override suspend fun signIn(credential: Credential): Session = when (credential) {
        is Credential.Password -> {
            val body = buildJsonObject { put("username", credential.username); put("password", credential.password) }
            val response: LoginResponse = api.send("POST", "/api/login", body.toString(), authorized = false)
            Session(response.token, response.username, response.expiresAt)
        }
    }
}

/** Keeps the session in app-private preferences, encrypted with a key that never leaves the Android Keystore. */
class KeystoreSessionStorage(context: Context) : SessionStorage {
    private val preferences = context.getSharedPreferences("session", Context.MODE_PRIVATE)
    private val alias = "course_smash_session"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(spec) }.generateKey()
    }

    override fun load(): Session? = runCatching {
        val (iv, sealed) = (preferences.getString("value", null) ?: return null).split(":").map { Base64.decode(it, Base64.NO_WRAP) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
        Json.decodeFromString<Session>(String(cipher.doFinal(sealed)))
    }.getOrNull()

    override fun save(session: Session) {
        runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val sealed = cipher.doFinal(Json.encodeToString(Session.serializer(), session).toByteArray())
            val value = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP)
            preferences.edit().putString("value", value).apply()
        }
    }

    override fun clear() {
        preferences.edit().clear().apply()
    }
}

/** The signed-in state for the whole app. */
class SessionStore(private val storage: SessionStorage, private val service: AuthService) {
    var session by mutableStateOf<Session?>(null)
        private set

    init {
        val saved = storage.load()
        if (saved?.isValid == true) session = saved else storage.clear()
    }

    val token: String? get() = session?.takeIf { it.isValid }?.token

    suspend fun signIn(credential: Credential) {
        val new = service.signIn(credential)
        storage.save(new)
        session = new
    }

    /** Sessions are signed, not stored on the server, so signing out is forgetting the token. */
    fun signOut() {
        storage.clear()
        session = null
    }
}
