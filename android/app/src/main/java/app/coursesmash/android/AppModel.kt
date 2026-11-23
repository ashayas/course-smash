package app.coursesmash.android

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.coursesmash.android.art.CityEngine
import app.coursesmash.android.screens.RecallModel

/** The four tabs in the bar at the bottom. The app opens on Today. */
enum class Tab(val title: String) { Today("Today"), City("City"), Library("Library"), You("You") }

/** Screens pushed on top of a tab. */
sealed interface Route {
    data class Course(val id: String) : Route
    data class LibraryCourse(val id: String) : Route
    data object Stats : Route
}

class AppModel(application: Application) : AndroidViewModel(application) {
    val api = ApiClient(baseUrlOverride ?: BuildConfig.API_BASE_URL)
    val session = SessionStore(KeystoreSessionStorage(application), WorkerAuthService(api))
    val city = CityEngine(application)

    /** Daily recall and the streak, kept here so Today shows at once when the learner comes back to it. */
    val recall = RecallModel(api, viewModelScope)

    var tab by mutableStateOf(Tab.Today)
        private set
    val path = mutableStateListOf<Route>()

    /** The track the library opens on, as `#/library?track=` does on the web. */
    var libraryTrack by mutableStateOf("")
        private set

    /** Set when Today's "Choose courses" opens You, so You scrolls to the courses in daily recall. You clears it. */
    var showRecallCourses by mutableStateOf(false)

    private var config: AppConfig? = null
    private var catalog: Catalog? = null

    init {
        api.token = { session.token }
        api.onUnauthorized = { signOut() }
    }

    fun show(tab: Tab, track: String = "") {
        libraryTrack = track
        path.clear()
        this.tab = tab
    }

    /** You, scrolled to the card that chooses which courses feed daily recall. */
    fun chooseRecallCourses() {
        show(Tab.You)
        showRecallCourses = true
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
        tab = Tab.Today
        catalog = null
        recall.reset()
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
