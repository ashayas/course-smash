package app.coursesmash.android.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.coursesmash.android.AppModel
import app.coursesmash.android.Credential
import app.coursesmash.android.art.SvgDocument
import app.coursesmash.android.art.SvgView
import app.coursesmash.android.art.rememberArt
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.Field
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.panel
import kotlinx.coroutines.launch

/** The login gate: the same username and password as the web app. The password is never shown. */
@Composable
fun LoginScreen(model: AppModel) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current

    fun logIn() {
        val name = username.trim()
        if (working || name.isEmpty() || password.isEmpty()) return
        working = true
        error = null
        focus.clearFocus()
        scope.launch {
            try {
                model.session.signIn(Credential.Password(name, password))
            } catch (failure: Exception) {
                error = messageOf(failure)
                working = false
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 16.dp).padding(top = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        val city = rememberArt(model.city, model.city.city(emptyList()))
        SvgView(city ?: SvgDocument.Empty, Modifier.widthIn(max = 520.dp).fillMaxWidth().aspectRatio(city?.aspectRatio ?: 1.5f).clearAndSetSemantics {}, floats = true)
        T("Course Smash", TypeStyle.LoginHero, heading = true)
        T("Log in and tell me what you want to learn.", TypeStyle.Lead, color = Theme.Muted, align = TextAlign.Center)

        Column(Modifier.widthIn(max = 560.dp).fillMaxWidth().panel().padding(28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            error?.let { ErrorText(it, tag = "login-error") }
            T("Username", TypeStyle.SmallMedium, Modifier.padding(top = 8.dp))
            Field(
                username, { username = it }, label = "Username", tag = "username",
                modifier = Modifier.semantics { contentType = ContentType.Username },
                keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Next),
                actions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }),
            )
            T("Password", TypeStyle.SmallMedium, Modifier.padding(top = 8.dp))
            Field(
                password, { password = it }, label = "Password", tag = "password",
                modifier = Modifier.semantics { contentType = ContentType.Password },
                keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false, imeAction = ImeAction.Go),
                actions = KeyboardActions(onGo = { logIn() }),
                transformation = PasswordVisualTransformation(),
            )
            PillButton(if (working) "Logging in..." else "Log in", ::logIn, Modifier.padding(top = 16.dp), enabled = !working, fullWidth = true, tag = "log-in")
        }
        SiteFooter()
    }
}
