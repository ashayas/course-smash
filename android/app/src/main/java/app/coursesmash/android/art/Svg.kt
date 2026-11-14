package app.coursesmash.android.art

import android.graphics.Region
import android.util.Xml
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.PathParser
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import kotlin.math.cos
import kotlin.math.sin

// A small SVG reader for the markup public/city.js writes: paths, ellipses, circles, rects and groups,
// with flat fills, strokes, rotate() transforms and the animation classes from styles.css.
// It is not a general SVG renderer. Question figures, which can hold text, go through FigureView.

/** The looping animations in styles.css, by class name. */
enum class Motion { Ripple, Ferry, Blink, Smoke, Crane, Spin, Flag, Beacon, Drop, Confetti }

/** A 2D affine transform: x' = a·x + c·y + tx, y' = b·x + d·y + ty. */
class Affine(val a: Float = 1f, val b: Float = 0f, val c: Float = 0f, val d: Float = 1f, val tx: Float = 0f, val ty: Float = 0f) {
    val isIdentity: Boolean get() = a == 1f && b == 0f && c == 0f && d == 1f && tx == 0f && ty == 0f

    /** This transform first, then [next]. */
    fun then(next: Affine) = Affine(
        next.a * a + next.c * b, next.b * a + next.d * b,
        next.a * c + next.c * d, next.b * c + next.d * d,
        next.a * tx + next.c * ty + next.tx, next.b * tx + next.d * ty + next.ty,
    )

    fun map(point: Offset) = Offset(a * point.x + c * point.y + tx, b * point.x + d * point.y + ty)

    fun toMatrix() = Matrix().also {
        it.values[Matrix.ScaleX] = a; it.values[Matrix.SkewY] = b
        it.values[Matrix.SkewX] = c; it.values[Matrix.ScaleY] = d
        it.values[Matrix.TranslateX] = tx; it.values[Matrix.TranslateY] = ty
    }

    companion object {
        val Identity = Affine()
        fun translate(x: Float, y: Float) = Affine(tx = x, ty = y)
        fun rotate(radians: Double) = Affine(cos(radians).toFloat(), sin(radians).toFloat(), -sin(radians).toFloat(), cos(radians).toFloat())

        /** [transform] carried out around [point] instead of the origin. */
        fun about(point: Offset, transform: Affine) = translate(-point.x, -point.y).then(transform).then(translate(point.x, point.y))
    }
}

class SvgNode {
    /** Null for a group. */
    var path: Path? = null
    val children = mutableListOf<SvgNode>()
    var fill: Color? = null
    var stroke: Color? = null
    var strokeStyle: Stroke = Stroke(1f)
    var opacity = 1f
    var transform = Affine.Identity
    var motion: Motion? = null

    /** `animation-delay`, from the d0 to d4 classes. */
    var delay = 0.0

    /** The `transform-origin` attribute, in user units. */
    var origin: Offset? = null

    /** `data-lot`: a course's index in the city, or "new" for the building site. */
    var lot: String? = null

    /** Bounds of what this node draws, before its own transform. */
    var bounds: Rect = Rect.Zero
}

class SvgDocument(val viewBox: Rect, val nodes: List<SvgNode>) {
    val animated: Boolean
    /** Tappable city lots, in drawing order. */
    val lots: List<SvgNode>

    init {
        var moving = false
        val found = mutableListOf<SvgNode>()
        fun walk(node: SvgNode) {
            if (node.motion != null) moving = true
            if (node.lot != null) found.add(node)
            node.children.forEach(::walk)
        }
        nodes.forEach(::walk)
        animated = moving
        lots = found
    }

    val aspectRatio: Float get() = if (viewBox.height > 0) viewBox.width / viewBox.height else 1f

    /** The lot under a point given in user units, front-most first. */
    fun lotAt(point: Offset): String? = lots.asReversed().firstOrNull { it.bounds.contains(point) && hit(it, point) }?.lot

    private fun hit(node: SvgNode, point: Offset): Boolean {
        val path = node.path ?: return node.children.any { hit(it, point) }
        if (node.fill == null || !node.bounds.contains(point)) return false
        // Region works in whole units, so test at eight times the scale.
        val scaled = android.graphics.Path(path.asAndroidPath()).apply { transform(android.graphics.Matrix().apply { setScale(8f, 8f) }) }
        val clip = Region((node.bounds.left * 8).toInt() - 8, (node.bounds.top * 8).toInt() - 8, (node.bounds.right * 8).toInt() + 8, (node.bounds.bottom * 8).toInt() + 8)
        return Region().apply { setPath(scaled, clip) }.contains((point.x * 8).toInt(), (point.y * 8).toInt())
    }

    companion object {
        val Empty = SvgDocument(Rect(0f, 0f, 1f, 1f), emptyList())

        fun parse(markup: String): SvgDocument? = runCatching {
            val parser = Xml.newPullParser().apply { setInput(StringReader(markup)) }
            val root = SvgNode()
            val stack = ArrayDeque(listOf(root))
            var viewBox: Rect? = null
            var event = parser.eventType
            while (event != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG) {
                    if (parser.name == "svg") {
                        val v = numbers(parser.getAttributeValue(null, "viewBox") ?: "")
                        if (v.size == 4) viewBox = Rect(v[0], v[1], v[0] + v[2], v[1] + v[3])
                    } else {
                        read(parser)?.let { node ->
                            stack.last().children.add(node)
                            if (parser.name == "g") stack.addLast(node)
                        }
                    }
                } else if (event == XmlPullParser.END_TAG && parser.name == "g" && stack.size > 1) {
                    stack.removeLast()
                }
                event = parser.next()
            }
            val box = viewBox ?: return null
            if (box.width <= 0 || box.height <= 0) return null
            root.children.forEach(::measure)
            SvgDocument(box, root.children)
        }.getOrNull()

        private fun measure(node: SvgNode): Rect {
            val path = node.path
            node.bounds = if (path != null) path.getBounds() else {
                var all: Rect? = null
                for (child in node.children) {
                    val rect = measure(child)
                    if (!rect.isEmpty) all = all?.let { Rect(minOf(it.left, rect.left), minOf(it.top, rect.top), maxOf(it.right, rect.right), maxOf(it.bottom, rect.bottom)) } ?: rect
                }
                all ?: Rect.Zero
            }
            if (node.bounds.isEmpty || node.transform.isIdentity) return node.bounds
            val b = node.bounds
            val corners = listOf(b.topLeft, b.topRight, b.bottomLeft, b.bottomRight).map(node.transform::map)
            return Rect(corners.minOf { it.x }, corners.minOf { it.y }, corners.maxOf { it.x }, corners.maxOf { it.y })
        }

        private fun read(parser: XmlPullParser): SvgNode? {
            fun text(name: String): String? = parser.getAttributeValue(null, name)
            fun number(name: String): Float = text(name)?.toFloatOrNull() ?: 0f
            val node = SvgNode()
            when (parser.name) {
                "g" -> {}
                "path" -> node.path = PathParser().parsePathString(text("d") ?: "").toPath()
                "ellipse" -> node.path = Path().apply { addOval(Rect(number("cx") - number("rx"), number("cy") - number("ry"), number("cx") + number("rx"), number("cy") + number("ry"))) }
                "circle" -> node.path = Path().apply { addOval(Rect(number("cx") - number("r"), number("cy") - number("r"), number("cx") + number("r"), number("cy") + number("r"))) }
                "rect" -> {
                    val rect = Rect(number("x"), number("y"), number("x") + number("width"), number("y") + number("height"))
                    node.path = Path().apply { if (text("rx") == null) addRect(rect) else addRoundRect(RoundRect(rect, CornerRadius(number("rx")))) }
                }
                else -> return null
            }
            if (node.path != null) {
                val stroke = color(text("stroke"))
                node.stroke = stroke
                // Unfilled strokes in city.js are lines, so a missing fill only means black when there is no stroke.
                node.fill = if (text("fill") == null) (if (stroke == null) Color.Black else null) else color(text("fill"))
                if (stroke != null) {
                    val dash = numbers(text("stroke-dasharray") ?: "")
                    node.strokeStyle = Stroke(
                        width = text("stroke-width")?.toFloatOrNull() ?: 1f,
                        cap = if (text("stroke-linecap") == "round") StrokeCap.Round else StrokeCap.Butt,
                        pathEffect = if (dash.size >= 2 && dash.size % 2 == 0) PathEffect.dashPathEffect(dash.toFloatArray()) else null,
                    )
                }
            }
            text("opacity")?.toFloatOrNull()?.let { node.opacity = it }
            text("transform")?.let { node.transform = transform(it) }
            text("transform-origin")?.let { numbers(it).takeIf { o -> o.size == 2 }?.let { o -> node.origin = Offset(o[0], o[1]) } }
            node.lot = text("data-lot")
            var step = 0
            for (word in (text("class") ?: "").split(" ")) {
                val motion = Motion.entries.firstOrNull { it.name.equals(word, ignoreCase = true) }
                if (motion != null) node.motion = motion
                // The skyline at the back of the city sits a little behind everything else.
                else if (word == "filler") node.opacity *= 0.9f
                else if (word.length == 2 && word[0] == 'd' && word[1].isDigit()) step = word[1].digitToInt()
            }
            // Delay classes count steps: 0.8s for ripples and confetti, 0.32s for the loader's floors.
            node.delay = step * if (node.motion == Motion.Drop) 0.32 else 0.8
            return node
        }

        private fun numbers(text: String): List<Float> = text.split(' ', ',').mapNotNull { it.toFloatOrNull() }

        private val colors = HashMap<String, Color>()

        private fun color(value: String?): Color? {
            if (value == null || value == "none" || value.length != 7 || value[0] != '#') return null
            return colors.getOrPut(value) { Color(0xFF000000 or value.substring(1).toLong(16)) }
        }

        /** Only rotate(angle cx cy) appears in city.js. */
        private fun transform(value: String): Affine {
            if (!value.startsWith("rotate(") || !value.endsWith(")")) return Affine.Identity
            val n = numbers(value.substring(7, value.length - 1))
            val angle = n.firstOrNull() ?: return Affine.Identity
            val centre = if (n.size == 3) Offset(n[1], n[2]) else Offset.Zero
            return Affine.about(centre, Affine.rotate(Math.toRadians(angle.toDouble())))
        }
    }
}
