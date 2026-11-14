package app.coursesmash.android.art

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import app.coursesmash.android.ui.LocalStill
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.tan

/** Draws a city.js drawing, scaled to fit and centred, with the same looping motion as the web app. */
@Composable
fun SvgView(
    document: SvgDocument,
    modifier: Modifier = Modifier,
    /** The slow up-and-down drift the web app gives the hero city. */
    floats: Boolean = false,
    /** Called with a lot's `data-lot` value when the learner taps a building in the city. */
    onTapLot: ((String) -> Unit)? = null,
) {
    val moving = (document.animated || floats) && !LocalStill.current
    // The frame time is only read while drawing, so a new frame redraws the canvas without recomposing anything.
    val clock = remember { mutableLongStateOf(0L) }
    if (moving) {
        LaunchedEffect(document) {
            var last = 0L
            while (true) withFrameNanos { now ->
                if (now - last >= 33_000_000L) { // about thirty frames a second is plenty for this art
                    last = now
                    clock.longValue = now
                }
            }
        }
    }
    val tap = if (onTapLot == null) Modifier else Modifier.pointerInput(document) {
        detectTapGestures { at ->
            val fit = fit(document, Size(size.width.toFloat(), size.height.toFloat()))
            val point = Offset((at.x - fit.second.x) / fit.first + document.viewBox.left, (at.y - fit.second.y) / fit.first + document.viewBox.top)
            document.lotAt(point)?.let(onTapLot)
        }
    }
    Canvas(modifier.then(tap)) {
        val time = if (moving) clock.longValue / 1e9 else null
        val (scale, offset) = fit(document, size)
        val drift = if (floats && time != null) (-8.0 * SvgClock.swing(time, 8.0)).toFloat() * density else 0f
        withTransform({
            translate(offset.x, offset.y + drift)
            scale(scale, scale, Offset.Zero)
            translate(-document.viewBox.left, -document.viewBox.top)
        }) {
            for (node in document.nodes) draw(node, time, 1f)
        }
    }
}

/** `preserveAspectRatio="xMidYMid meet"`. */
private fun fit(document: SvgDocument, size: Size): Pair<Float, Offset> {
    val box = document.viewBox
    val scale = min(size.width / box.width, size.height / box.height)
    return scale to Offset((size.width - box.width * scale) / 2, (size.height - box.height * scale) / 2)
}

private val layerPaint = Paint()

private fun DrawScope.draw(node: SvgNode, time: Double?, inherited: Float) {
    var opacity = node.opacity
    var transform = node.transform
    val motion = node.motion
    if (motion != null && time != null) {
        val frame = SvgClock.frame(motion, node, time)
        // CSS moves the element as a whole, so the motion goes outside its own transform.
        transform = transform.then(frame.transform)
        opacity *= frame.opacity
    }
    if (opacity <= 0.001f) return

    val body: DrawScope.() -> Unit = {
        val path = node.path
        if (path != null) {
            node.fill?.let { drawPath(path, it, alpha = opacity * inherited) }
            node.stroke?.let { drawPath(path, it, alpha = opacity * inherited, style = node.strokeStyle) }
        } else if (opacity < 0.999f) {
            // A see-through group is flattened first, so its own parts don't show through each other.
            drawIntoCanvas { canvas ->
                canvas.saveLayer(node.bounds.inflate(48f), layerPaint.apply { alpha = opacity * inherited })
                for (child in node.children) draw(child, time, 1f)
                canvas.restore()
            }
        } else {
            for (child in node.children) draw(child, time, inherited)
        }
    }
    if (transform.isIdentity) body() else withTransform({ transform(transform.toMatrix()) }, body)
}

/** The keyframes from styles.css, worked out for a moment in time. */
object SvgClock {
    class Frame(val transform: Affine = Affine.Identity, val opacity: Float = 1f)

    /** 0 to 1 and back over one period with ease-in-out on each half: a keyframe at 50%. */
    fun swing(time: Double, period: Double, delay: Double = 0.0): Double {
        val p = phase(time, period, delay)
        return Bezier.EaseInOut(if (p < 0.5) p * 2 else (1 - p) * 2)
    }

    fun phase(time: Double, period: Double, delay: Double = 0.0): Double {
        val p = ((time - delay) / period) % 1.0
        return if (p < 0) p + 1 else p
    }

    fun frame(motion: Motion, node: SvgNode, time: Double): Frame {
        val origin = node.origin ?: Offset.Zero
        return when (motion) {
            Motion.Ripple -> swing(time, 4.0, node.delay).let { Frame(Affine.translate((6 * it).toFloat(), 0f), (1 - 0.65 * it).toFloat()) }
            Motion.Ferry -> swing(time, 7.0).let { Frame(Affine.translate((10 * it).toFloat(), (5 * it).toFloat())) }
            // steps(2, jump-none): on, off, off, on.
            Motion.Blink -> phase(time, 1.6).let { Frame(opacity = if (it < 0.25 || it >= 0.75) 1f else 0.2f) }
            Motion.Smoke -> {
                val p = phase(time, 3.2)
                val travel = Bezier.EaseInOut(p)
                val opacity = if (p < 0.4) Bezier.EaseInOut(p / 0.4) else 1 - Bezier.EaseInOut((p - 0.4) / 0.6)
                Frame(Affine.translate((6 * travel).toFloat(), (6 - 16 * travel).toFloat()), opacity.toFloat())
            }
            // Sways about the bottom-left corner of its own box.
            Motion.Crane -> Frame(Affine.about(Offset(node.bounds.left, node.bounds.bottom), Affine.rotate(Math.toRadians(-1.5 * swing(time, 5.0)))))
            Motion.Spin -> Frame(Affine.about(origin, Affine.rotate(2 * Math.PI * phase(time, 7.0))))
            Motion.Flag -> {
                // skewY(-6deg) scaleX(.92) at the halfway point.
                val f = swing(time, 2.6)
                val skew = Affine(b = tan(Math.toRadians(-6 * f)).toFloat())
                Frame(Affine.about(origin, Affine(a = (1 - 0.08 * f).toFloat()).then(skew)))
            }
            Motion.Beacon -> Frame(opacity = (1 - 0.75 * swing(time, 3.2)).toFloat())
            Motion.Drop -> {
                // A floor falls into place, holds, then fades before the next round.
                val p = phase(time, 2.6, node.delay)
                when {
                    p < 0.18 -> Bezier.Spring(p / 0.18).let { Frame(Affine.translate(0f, (-40 * (1 - it)).toFloat()), it.coerceIn(0.0, 1.0).toFloat()) }
                    p > 0.82 -> Frame(opacity = (1 - Bezier.Spring((p - 0.82) / 0.18).coerceIn(0.0, 1.0)).toFloat())
                    else -> Frame()
                }
            }
            Motion.Confetti -> swing(time, 2.4, node.delay).let { Frame(Affine.translate(0f, (8 * it).toFloat()), (1 - 0.4 * it).toFloat()) }
        }
    }
}

/** A CSS cubic-bezier timing function. */
class Bezier(private val x1: Double, private val y1: Double, private val x2: Double, private val y2: Double) {
    operator fun invoke(x: Double): Double {
        if (x <= 0) return 0.0
        if (x >= 1) return 1.0
        fun curve(t: Double, a: Double, b: Double): Double {
            val u = 1 - t
            return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
        }
        // Bisection: x is monotonic in t for valid timing functions.
        var low = 0.0
        var high = 1.0
        var t = x
        repeat(24) {
            val estimate = curve(t, x1, x2)
            if (abs(estimate - x) < 0.0005) return curve(t, y1, y2)
            if (estimate < x) low = t else high = t
            t = (low + high) / 2
        }
        return curve(t, y1, y2)
    }

    companion object {
        val EaseInOut = Bezier(0.42, 0.0, 0.58, 1.0)
        /** `--spring` in styles.css. */
        val Spring = Bezier(0.34, 1.56, 0.64, 1.0)
    }
}
