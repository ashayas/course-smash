package app.coursesmash.android.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.coursesmash.android.R

/** The Course Smash city design kit (DESIGN.md): colours, type and shapes. */
object Theme {
    // Neutrals
    val Ink = Color(0xFF141414)
    val Surface = Color(0xFF1F1F1D)
    val Paper = Color(0xFFFBFBFB)
    val Muted = Color(0xFFA3A3A0)

    // Accents
    val Orange = Color(0xFFE65F2B)
    val Yellow = Color(0xFFF5D556)
    val Green = Color(0xFF469B5B)
    val Blue = Color(0xFF5889F7)
    val Purple = Color(0xFF904CF6)
    val Pink = Color(0xFFE7A0EA)

    // Trim colours that only the buildings use.
    val Red = Color(0xFFC8402F)
    val Teal = Color(0xFF4FA39D)

    // Chart rules.
    val GridLine = Color(0xFF2C2C29)
    val BaseLine = Color(0xFF3A3A37)

    val CardRadius = 28.dp
    val PanelRadius = 36.dp
    val InsetRadius = 20.dp

    /** Phone layout: the web app's gutter and gap below 680px. */
    val Gutter = 16.dp
    val Gap = 16.dp

    /** The kit's springy easing with a slight overshoot. */
    fun <T> spring() = spring<T>(dampingRatio = 0.55f, stiffness = Spring.StiffnessMedium)

    fun accent(name: String): Color = when (name) {
        "orange" -> Orange
        "yellow" -> Yellow
        "green" -> Green
        "blue" -> Blue
        "pink" -> Pink
        "purple" -> Purple
        "red" -> Red
        "teal" -> Teal
        else -> Muted
    }

    /** Green at 70% and over, yellow from 40%, orange below. Used by every meter. */
    fun score(value: Double): Color = if (value >= 0.7) Green else if (value >= 0.4) Yellow else Orange
}

/** Inter Tight in the four weights the kit uses. */
val InterTight = FontFamily(
    Font(R.font.inter_tight_regular, FontWeight.Normal),
    Font(R.font.inter_tight_medium, FontWeight.Medium),
    Font(R.font.inter_tight_semibold, FontWeight.SemiBold),
    Font(R.font.inter_tight_extrabold, FontWeight.ExtraBold),
)

/** One row of the kit's type table. Tracking is in em and leading is a multiple of the size. */
data class TypeStyle(val size: Int, val weight: FontWeight = FontWeight.Normal, val tracking: Float = -0.01f, val leading: Float = 1.35f) {
    val text: TextStyle
        get() = TextStyle(fontFamily = InterTight, fontSize = size.sp, fontWeight = weight, letterSpacing = tracking.em, lineHeight = (size * leading).sp)

    companion object {
        val Hero = TypeStyle(52, FontWeight.ExtraBold, -0.055f, 0.96f)
        val LoginHero = TypeStyle(48, FontWeight.ExtraBold, -0.055f, 0.96f)
        val Section = TypeStyle(40, FontWeight.SemiBold, -0.04f, 1.05f)
        val PageTitle = TypeStyle(36, FontWeight.SemiBold, -0.04f, 1.05f)
        val TitleLarge = TypeStyle(35, FontWeight.SemiBold, -0.03f, 1.05f)
        val TitleSmall = TypeStyle(25, FontWeight.SemiBold, -0.03f, 1.05f)
        val Question = TypeStyle(25, FontWeight.SemiBold, -0.03f, 1.1f)
        val Lead = TypeStyle(22)
        val Body = TypeStyle(19)
        val Small = TypeStyle(16)
        val SmallMedium = TypeStyle(16, FontWeight.Medium)
        val Button = TypeStyle(16, FontWeight.Medium, 0f)
        val Caption = TypeStyle(14)
        val Tiny = TypeStyle(13)
    }
}

/** The text colour for whatever surface the content sits on: paper on dark, ink on a colour block. */
val LocalInk = compositionLocalOf { Theme.Paper }

/** True when looping art should hold still: animations are off in system settings, or a UI test asked. */
val LocalStill = compositionLocalOf { false }

val Dp.half: Dp get() = this / 2
