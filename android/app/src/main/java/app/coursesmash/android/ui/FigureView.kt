package app.coursesmash.android.ui

import android.graphics.Color as AndroidColor
import android.net.Uri
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * A question's diagram: SVG a model drew, already sanitised by the Worker (src/figure.ts).
 * It is shown the way the web app shows it, as an image, so nothing inside it can run. JavaScript is off as well.
 */
@Composable
fun FigureView(svg: String, alt: String?, modifier: Modifier = Modifier) {
    val ratio = figureRatio(svg) ?: return
    AndroidView(
        modifier = modifier
            .testTag("figure")
            .fillMaxWidth()
            .background(Theme.Paper, RoundedCornerShape(Theme.InsetRadius))
            .padding(18.dp)
            .heightIn(max = 460.dp)
            .aspectRatio(ratio)
            .semantics { contentDescription = alt?.takeIf { it.isNotEmpty() } ?: "Diagram for this question" },
        factory = { context ->
            StillWebView(context).apply {
                settings.javaScriptEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.blockNetworkLoads = true
                setBackgroundColor(AndroidColor.TRANSPARENT)
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                isClickable = false
                isLongClickable = false
                isFocusable = false
            }
        },
        update = { view ->
            if (view.tag != svg) {
                view.tag = svg
                // The height comes from the drawing's own proportions. Percentage heights collapse to nothing in a web view sized from outside.
                val html = """
                    <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
                    <style>html, body { margin: 0; background: transparent; } img { display: block; width: 100%; height: auto; }</style>
                    </head><body><img alt="" src="data:image/svg+xml;charset=utf-8,${Uri.encode(svg)}"></body></html>
                """.trimIndent()
                view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
            }
        },
    )
}

/** The Worker only keeps figures that have a viewBox. */
private fun figureRatio(svg: String): Float? {
    val box = Regex("""viewBox\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE).find(svg)?.groupValues?.get(1) ?: return null
    val numbers = box.split(' ', ',').mapNotNull { it.toFloatOrNull() }
    if (numbers.size != 4 || numbers[2] <= 0 || numbers[3] <= 0) return null
    return numbers[2] / numbers[3]
}
