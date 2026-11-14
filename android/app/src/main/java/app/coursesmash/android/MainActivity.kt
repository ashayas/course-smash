package app.coursesmash.android

import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import app.coursesmash.android.screens.LoginScreen
import app.coursesmash.android.screens.Shell
import app.coursesmash.android.ui.LocalStill
import app.coursesmash.android.ui.Theme

class MainActivity : ComponentActivity() {
    private val model: AppModel by viewModels()

    @OptIn(ExperimentalComposeUiApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        // Debug builds can be pointed at a local `wrangler dev`, for development and for the walkthrough test.
        if (BuildConfig.DEBUG) intent.getStringExtra("cs_base_url")?.let { AppModel.baseUrlOverride = it }
        // The page is always dark, so the system bars get light icons.
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        // Looping art holds still when animations are off in system settings, or when a UI test asks.
        val animationsOff = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        val still = animationsOff || intent.getBooleanExtra("cs_still", false)
        setContent {
            CompositionLocalProvider(LocalStill provides still) {
                Box(Modifier.fillMaxSize().background(Theme.Ink).safeDrawingPadding().semantics { testTagsAsResourceId = true }) {
                    if (model.session.session == null) LoginScreen(model) else Shell(model)
                }
            }
        }
    }
}
