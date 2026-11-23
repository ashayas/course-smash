package app.coursesmash.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNamingStrategy
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.ZoneId

/** A failure the learner can read. The message comes from the Worker when it sent one. */
class ApiException(override val message: String, val status: Int = 0) : Exception(message) {
    companion object {
        const val GENERIC = "Something went wrong. Try again."
        const val OFFLINE = "Can't reach Course Smash. Check your connection and try again."
    }
}

fun messageOf(error: Throwable): String = (error as? ApiException)?.message ?: ApiException.GENERIC

/** Talks to the Worker's JSON endpoints under /api/. */
class ApiClient(val baseUrl: String) {
    /** Set once at launch. Returns the current session token. */
    var token: () -> String? = { null }

    /** Called on the main thread when the Worker says the session is no longer good. */
    var onUnauthorized: () -> Unit = {}

    @OptIn(ExperimentalSerializationApi::class)
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        namingStrategy = JsonNamingStrategy.SnakeCase
    }

    suspend inline fun <reified T> get(path: String, query: Map<String, String> = emptyMap()): T =
        decode(request("GET", path, query, null, true), path)

    suspend inline fun <reified T> send(method: String, path: String, body: String? = null, authorized: Boolean = true): T =
        decode(request(method, path, emptyMap(), body, authorized), path)

    inline fun <reified T> decode(response: Pair<Int, String>, path: String): T {
        val (status, text) = response
        // Advancing a course reports its outcome in the body even when the status is an error.
        val lenient = path.endsWith("/advance")
        if (status !in 200..299 && !lenient) throw ApiException(errorIn(text) ?: ApiException.GENERIC, status)
        return try {
            json.decodeFromString<T>(text)
        } catch (error: Exception) {
            if (BuildConfig.DEBUG) android.util.Log.w("CourseSmash", "Could not read the response from $path", error)
            throw ApiException((if (lenient) errorIn(text) else null) ?: ApiException.GENERIC, status)
        }
    }

    fun errorIn(text: String): String? = runCatching { json.decodeFromString<ErrorBody>(text).error }.getOrNull()

    suspend fun request(method: String, path: String, query: Map<String, String>, body: String?, authorized: Boolean): Pair<Int, String> {
        val bearer = if (authorized) token() else null
        val result = withContext(Dispatchers.IO) {
            val search = if (query.isEmpty()) "" else "?" + query.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
            val connection = URL(baseUrl + path + search).openConnection() as HttpURLConnection
            try {
                connection.requestMethod = method
                connection.connectTimeout = 20_000
                connection.readTimeout = 240_000 // the agent can take a few minutes to plan a course
                connection.instanceFollowRedirects = false
                connection.setRequestProperty("Accept", "application/json")
                // The Worker counts days and streaks in the learner's own time zone.
                connection.setRequestProperty("X-Time-Zone", ZoneId.systemDefault().id)
                if (bearer != null) connection.setRequestProperty("Authorization", "Bearer $bearer")
                if (body != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { it.write(body.toByteArray()) }
                }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
            } catch (error: IOException) {
                throw ApiException(ApiException.OFFLINE)
            } finally {
                connection.disconnect()
            }
        }
        if (result.first == 401 && authorized) {
            onUnauthorized()
            throw ApiException("Please log in.", 401)
        }
        return result
    }

    // Daily recall, the streak and settings.

    suspend fun today(): Today = get("/api/today")

    /** `response` is the option's index as a string, or the short answer. */
    suspend fun answerRecall(id: String, response: String): RecallAnswer =
        send("POST", "/api/recall/$id/answer", buildJsonObject { put("response", response) }.toString())

    suspend fun skipRecall(id: String): RecallUpdate = send("POST", "/api/recall/$id/skip")

    /** Adds five questions to today's set, or to a course's session when `session` is its id. */
    suspend fun moreRecall(session: String? = null): RecallUpdate =
        send("POST", "/api/recall/more", session?.let { buildJsonObject { put("session", it) }.toString() })

    /** Starts "Recall this course", or carries on with today's open session for it. 409 with the reason when there is nothing to ask. */
    suspend fun startCourseRecall(courseId: String): RecallUpdate = send("POST", "/api/courses/$courseId/recall")

    suspend fun skipRecallDay(skipped: Boolean): RecallUpdate =
        send("POST", "/api/recall/skip-day", buildJsonObject { put("skipped", skipped) }.toString())

    suspend fun settings(): Settings = get("/api/settings")

    /** `recallCourses` turns courses on or off for daily recall, by id. */
    suspend fun saveSettings(dailyGoal: Int? = null, shortAnswers: Boolean? = null, recallCourses: Map<String, Boolean>? = null): Settings =
        send("PUT", "/api/settings", buildJsonObject {
            if (dailyGoal != null) put("daily_goal", dailyGoal)
            if (shortAnswers != null) put("short_answers", shortAnswers)
            if (recallCourses != null) put("recall_courses", buildJsonObject { recallCourses.forEach { (id, on) -> put(id, on) } })
        }.toString())

    @Serializable
    data class ErrorBody(val error: String? = null)
}
