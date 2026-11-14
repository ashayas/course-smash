package app.coursesmash.android

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import app.coursesmash.android.art.CityEngine

/** The three places in the header, matching the web app's nav. */
enum class Section(val title: String) { Courses("Courses"), Library("Library"), Stats("Stats") }

/** Screens pushed on top of a section. */
sealed interface Route {
    data class Course(val id: String) : Route
    data class LibraryCourse(val id: String) : Route
}

class AppModel(application: Application) : AndroidViewModel(application) {
    val api = ApiClient(baseUrlOverride ?: BuildConfig.API_BASE_URL)
    val session = SessionStore(KeystoreSessionStorage(application), WorkerAuthService(api))
    val city = CityEngine(application)

    var section by mutableStateOf(Section.Courses)
        private set
    val path = mutableStateListOf<Route>()

    /** The track the library opens on, as `#/library?track=` does on the web. */
    var libraryTrack by mutableStateOf("")
        private set

    private var config: AppConfig? = null
    private var catalog: Catalog? = null

    init {
        api.token = { session.token }
        api.onUnauthorized = { signOut() }
    }

    fun show(section: Section, track: String = "") {
        libraryTrack = track
        path.clear()
        this.section = section
    }

    fun open(route: Route) {
        path.add(route)
    }

    fun back() {
        if (path.isNotEmpty()) path.removeAt(path.lastIndex)
    }

    fun signOut() {
        session.signOut()
        path.clear()
        section = Section.Courses
        catalog = null
    }

    /** Starter ideas and the building picker's choices. Fetched once. */
    suspend fun loadConfig(): AppConfig = config ?: api.get<AppConfig>("/api/app").also { config = it }

    /** The library. Fetched once per sign-in, as the web app does per page load. */
    suspend fun loadCatalog(): Catalog = catalog ?: api.get<Catalog>("/api/catalog").also { catalog = it }

    companion object {
        /** Debug builds can point at a local `wrangler dev`. MainActivity sets this from an intent extra before the model exists. */
        var baseUrlOverride: String? = null
    }
}
