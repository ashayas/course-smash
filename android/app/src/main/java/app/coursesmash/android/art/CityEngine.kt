package app.coursesmash.android.art

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import app.coursesmash.android.CatalogCourse
import app.coursesmash.android.CourseDetail
import app.coursesmash.android.CourseSummary
import app.coursesmash.android.Icon
import app.coursesmash.android.Stats
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.coroutines.resume

/** What city.js reads off a course to pick and draw its building. */
@Serializable
data class ArtSubject(
    val id: String,
    val title: String? = null,
    val prompt: String? = null,
    val tags: List<String> = emptyList(),
    val track: String? = null,
    val icon: Icon? = null,
    val status: String? = null,
    val modules: Int = 0,
    val passed: Int = 0,
)

/** How much of a building is built and lit. Floors are modules, and lit floors are passed modules. */
@Serializable
data class ArtProgress(val floors: Int, val lit: Int, val building: Boolean = false, val ambient: Double = 0.0)

/**
 * Runs the web app's public/city.js, so the app draws exactly the buildings the website does.
 * The file is bundled as it is and run in a WebView that is never shown and can load nothing else.
 * Only its `export` keywords are dropped, since it runs as a plain script.
 */
@SuppressLint("SetJavaScriptEnabled")
class CityEngine(context: Context) {
    private val json = Json { encodeDefaults = true; explicitNulls = true }
    private val cache = HashMap<String, SvgDocument>()
    private val ready = CompletableDeferred<Unit>()
    private val web = WebView(context.applicationContext).apply {
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.blockNetworkLoads = true
    }

    init {
        val source = context.assets.open("city.js").bufferedReader().use { it.readText() }.replace(Regex("(?m)^export\\s+"), "")
        val script = source + """
            ;globalThis.City = {
              building: (course, progress) => buildingSvg(course, progress ?? progressOf(course)),
              city: (courses) => citySvg(courses),
              finished: (course) => finishedSvg(course),
              mark: () => markSvg(),
              stack: () => stackSvg(),
              spec: (course) => { const s = specFor(course); return JSON.stringify({ archetype: s.archetype, material: s.material, roof: s.roof, accent: s.accent }); },
            }; "ready";
        """.trimIndent()
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(script) { ready.complete(Unit) }
            }
        }
        web.loadDataWithBaseURL(null, "<!doctype html><html><body></body></html>", "text/html", "utf-8", null)
    }

    /** A drawing that is already worked out, for showing at once without a frame of nothing. */
    fun peek(call: String): SvgDocument? = cache[call]

    private suspend fun evaluate(call: String): String? {
        ready.await()
        val result = suspendCancellableCoroutine { continuation -> web.evaluateJavascript(call) { continuation.resume(it) } }
        // The callback hands back a JSON string literal.
        return runCatching { Json.decodeFromString<String>(result) }.getOrNull()
    }

    suspend fun draw(call: String): SvgDocument {
        cache[call]?.let { return it }
        val document = evaluate(call)?.let(SvgDocument::parse) ?: return SvgDocument.Empty
        if (cache.size > 400) cache.clear()
        cache[call] = document
        return document
    }

    /** One building on its plaza. Without `progress`, city.js works it out from the course's modules. */
    fun building(subject: ArtSubject, progress: ArtProgress? = null) =
        "City.building(${json.encodeToString(ArtSubject.serializer(), subject)}, ${progress?.let { json.encodeToString(ArtProgress.serializer(), it) } ?: "null"})"

    /** The hero island: the learner's newest courses at the front, then a building site. */
    fun city(subjects: List<ArtSubject>) = "City.city([${subjects.joinToString(",") { json.encodeToString(ArtSubject.serializer(), it) }}])"

    /** The fully lit building under confetti. */
    fun finished(subject: ArtSubject) = "City.finished(${json.encodeToString(ArtSubject.serializer(), subject)})"

    /** The logo mark. */
    val mark = "City.mark()"

    /** The loader: floors dropping onto a tower. */
    val stack = "City.stack()"

    /** The building a course has now: its saved icon, or the one city.js picks from its topic. */
    suspend fun spec(subject: ArtSubject): Icon? =
        evaluate("City.spec(${json.encodeToString(ArtSubject.serializer(), subject)})")?.let { runCatching { Json.decodeFromString<Icon>(it) }.getOrNull() }
}

/** A drawing from city.js, named by the call that makes it. Null until the engine has worked it out. */
@Composable
fun rememberArt(engine: CityEngine, call: String): SvgDocument? {
    val document by produceState(engine.peek(call), call) { value = engine.draw(call) }
    return document
}

@Composable
fun Art(engine: CityEngine, call: String, modifier: Modifier = Modifier) {
    SvgView(rememberArt(engine, call) ?: SvgDocument.Empty, modifier)
}

val CourseSummary.art get() = ArtSubject(id, title, prompt, icon = icon, status = status, modules = modules, passed = passed)
val CatalogCourse.art get() = ArtSubject(id, title, tags = tags, track = track, icon = icon)
val Stats.Course.art get() = ArtSubject(id, title, prompt, icon = icon, status = status, modules = modules, passed = passed)

/** Until the outline exists the course draws as a building site, as on the web. */
val CourseDetail.art get() = ArtSubject(id, title, prompt, icon = icon, status = if (modules.isEmpty()) "building" else status, modules = modules.size, passed = passed)
