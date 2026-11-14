package app.coursesmash.android.ui

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.serialization.json.Json

private val MATH = Regex("""\\\((.+?)\\\)|\\\[([\s\S]+?)\\]""")

/**
 * Text the models wrote. Paired markdown markers are dropped and LaTeX inside \( \) or \[ \] is typeset,
 * the same rules as `plainText` and `rich` in the web app.
 *
 * Text without a formula, which is nearly all of it, is ordinary Compose text. Text with one is laid out by
 * the web app's own renderer, KaTeX, in a small web view, so formulas look the same on every platform.
 */
@Composable
fun RichText(source: String, style: TypeStyle, modifier: Modifier = Modifier, color: Color = LocalInk.current, heading: Boolean = false) {
    if (MATH.containsMatchIn(source)) MathText(source, style, color, modifier) else T(plain(source), style, modifier, color, heading = heading)
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun MathText(source: String, style: TypeStyle, color: Color, modifier: Modifier) {
    val fontScale = LocalConfiguration.current.fontScale
    val html = remember(source, style, color) { mathPage(source, style, color) }
    AndroidView(
        modifier = modifier.fillMaxWidth().semantics { contentDescription = plain(source) },
        factory = { context ->
            StillWebView(context).apply {
                // The only script that runs here is the bundled KaTeX. Model text goes in through textContent.
                settings.javaScriptEnabled = true
                settings.allowContentAccess = false
                settings.blockNetworkLoads = true
                setBackgroundColor(AndroidColor.TRANSPARENT)
                // Static content, drawn in software: it looks the same and does not depend on the GPU compositing a web view.
                setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null)
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                isClickable = false
                isLongClickable = false
                isFocusable = false
            }
        },
        update = { view ->
            view.settings.textZoom = (fontScale * 100).toInt()
            if (view.tag != html) {
                view.tag = html
                view.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "utf-8", null)
            }
        },
    )
}

private fun mathPage(source: String, style: TypeStyle, color: Color): String {
    val weight = style.weight.weight
    val file = when {
        weight >= 800 -> "inter_tight_extrabold"
        weight >= 600 -> "inter_tight_semibold"
        weight >= 500 -> "inter_tight_medium"
        else -> "inter_tight_regular"
    }
    val css = "#%06X".format(color.toArgb() and 0xFFFFFF)
    // JSON, with < escaped so nothing in the text can close the script element.
    val text = Json.encodeToString(kotlinx.serialization.serializer<String>(), source).replace("<", "\\u003c")
    return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          @font-face { font-family: "Inter Tight"; src: url("file:///android_res/font/$file.ttf"); }
          html, body { margin: 0; padding: 0; background: transparent; }
          body { font: $weight ${style.size}px/${style.leading} "Inter Tight", sans-serif; letter-spacing: ${style.tracking}em; color: $css; overflow-wrap: anywhere; }
          .math math { font-size: 1.05em; }
          .math-display { display: block; margin: 10px 0; overflow-x: auto; }
        </style></head><body><div id="text"></div>
        <script src="katex.min.js"></script>
        <script>
          const text = $text;
          const plain = (t) => t.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "$1").replace(/`([^`\n]+)`/g, "$1");
          const MATH = /\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/g;
          const out = document.getElementById("text");
          let last = 0;
          for (const m of text.matchAll(MATH)) {
            if (m.index > last) out.append(plain(text.slice(last, m.index)));
            const span = document.createElement("span");
            const display = m[2] != null;
            span.className = display ? "math math-display" : "math";
            try {
              katex.render(m[1] ?? m[2], span, { output: "mathml", displayMode: display, throwOnError: false, trust: false, maxSize: 20, maxExpand: 200 });
            } catch { span.textContent = m[1] ?? m[2]; }
            out.append(span);
            last = m.index + m[0].length;
          }
          if (last < text.length) out.append(plain(text.slice(last)));
        </script></body></html>
    """.trimIndent()
}

/**
 * A web view that only shows something. It takes no touches, so a tap reaches the option it sits in
 * and a drag that starts on it still scrolls the page.
 */
@SuppressLint("ViewConstructor")
class StillWebView(context: android.content.Context) : WebView(context) {
    override fun dispatchTouchEvent(event: android.view.MotionEvent): Boolean = false
}
