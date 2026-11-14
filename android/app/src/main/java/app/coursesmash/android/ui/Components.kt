package app.coursesmash.android.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Text in one of the kit's type styles. The colour follows the surface it sits on unless one is given. */
@Composable
fun T(
    text: String,
    style: TypeStyle,
    modifier: Modifier = Modifier,
    color: Color = LocalInk.current,
    align: TextAlign = TextAlign.Start,
    underline: Boolean = false,
    maxLines: Int = Int.MAX_VALUE,
    heading: Boolean = false,
) {
    BasicText(
        text = text,
        modifier = if (heading) modifier.semantics { heading() } else modifier,
        style = style.text.copy(color = color, textAlign = align, textDecoration = if (underline) TextDecoration.Underline else null),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

fun Modifier.panel(radius: Dp = Theme.PanelRadius) = background(Theme.Surface, RoundedCornerShape(radius))
fun Modifier.card(padding: Dp = 21.dp) = fillMaxWidth().background(Theme.Surface, RoundedCornerShape(Theme.CardRadius)).padding(padding)
fun Modifier.inset(radius: Dp = Theme.InsetRadius) = background(Theme.Ink, RoundedCornerShape(radius))
fun Modifier.tag(name: String?) = if (name == null) this else testTag(name)

/** Lifts a control a few dp while it is pressed, like the web app's hover. */
@Composable
fun Modifier.lift(source: MutableInteractionSource, by: Dp = 3.dp): Modifier {
    val pressed by source.collectIsPressedAsState()
    val still = LocalStill.current
    val shift by animateDpAsState(if (pressed && !still) -by else 0.dp, Theme.spring(), label = "lift")
    return offset(y = shift)
}

enum class Pill { Paper, Quiet, Ink }

/** The kit's full-pill button: paper by default, quiet on a surface, or ink on colour. */
@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: Pill = Pill.Paper,
    enabled: Boolean = true,
    fullWidth: Boolean = false,
    minHeight: Dp = 50.dp,
    padding: Dp = 26.dp,
    tag: String? = null,
) {
    val source = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .tag(tag)
            .then(if (fullWidth) Modifier.fillMaxWidth() else Modifier)
            .lift(source)
            .alpha(if (enabled) 1f else 0.55f)
            .clip(CircleShape)
            .background(when (kind) { Pill.Paper -> Theme.Paper; Pill.Quiet -> Theme.Surface; Pill.Ink -> Theme.Ink })
            .clickable(source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .heightIn(min = minHeight)
            .padding(horizontal = padding),
        contentAlignment = Alignment.Center,
    ) {
        T(text, TypeStyle.Button, color = if (kind == Pill.Paper) Theme.Ink else Theme.Paper, maxLines = 1)
    }
}

/** Underlined muted text that acts as a button. */
@Composable
fun LinkButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, tag: String? = null, color: Color = Theme.Muted) {
    Box(
        modifier = modifier.tag(tag).clickable(remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick).heightIn(min = 44.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        T(text, TypeStyle.Small, color = color, underline = true)
    }
}

/** A pill chip on ink, or yellow when it is the selected one. */
@Composable
fun Chip(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, on: Boolean = false, minHeight: Dp = 44.dp, tag: String? = null) {
    val source = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .tag(tag)
            .lift(source, 2.dp)
            .clip(CircleShape)
            .background(if (on) Theme.Yellow else Theme.Ink)
            .clickable(source, indication = null, role = Role.Button, onClick = onClick)
            .heightIn(min = minHeight)
            .padding(horizontal = 18.dp, vertical = 8.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        T(text, TypeStyle.Small, color = if (on) Theme.Ink else Theme.Paper)
    }
}

/** An error on the kit's orange block. */
@Composable
fun ErrorText(message: String, modifier: Modifier = Modifier, tag: String? = null) {
    T(
        message, TypeStyle.SmallMedium, color = Theme.Ink,
        modifier = modifier.tag(tag).fillMaxWidth().background(Theme.Orange, RoundedCornerShape(16.dp)).padding(horizontal = 18.dp, vertical = 12.dp),
    )
}

/** A multi-line text box on ink with a placeholder. */
@Composable
fun TextArea(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    label: String,
    limit: Int,
    modifier: Modifier = Modifier,
    tag: String? = null,
) {
    BasicTextField(
        value = value,
        onValueChange = { onChange(it.take(limit)) },
        textStyle = TypeStyle.Body.text.copy(color = Theme.Paper),
        cursorBrush = SolidColor(Theme.Yellow),
        modifier = modifier.tag(tag).fillMaxWidth().semantics { contentDescription = label },
        decorationBox = { field ->
            Box(Modifier.fillMaxWidth().inset().defaultMinSize(minHeight = 128.dp).padding(horizontal = 20.dp, vertical = 16.dp)) {
                if (value.isEmpty()) T(placeholder, TypeStyle.Body, color = Theme.Muted)
                field()
            }
        },
    )
}

/** A one-line field on ink, for the login form and the library search. */
@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    pill: Boolean = false,
    tag: String? = null,
    keyboard: KeyboardOptions = KeyboardOptions.Default,
    actions: KeyboardActions = KeyboardActions.Default,
    transformation: androidx.compose.ui.text.input.VisualTransformation = androidx.compose.ui.text.input.VisualTransformation.None,
) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        textStyle = TypeStyle.Body.text.copy(color = Theme.Paper),
        cursorBrush = SolidColor(Theme.Yellow),
        keyboardOptions = keyboard,
        keyboardActions = actions,
        visualTransformation = transformation,
        modifier = modifier.tag(tag).fillMaxWidth().semantics { contentDescription = label },
        decorationBox = { field ->
            Box(
                Modifier.fillMaxWidth().background(Theme.Ink, if (pill) CircleShape else RoundedCornerShape(Theme.InsetRadius))
                    .padding(horizontal = if (pill) 22.dp else 20.dp, vertical = 16.dp),
            ) {
                if (value.isEmpty() && placeholder.isNotEmpty()) T(placeholder, TypeStyle.Body, color = Theme.Muted, maxLines = 1)
                field()
            }
        },
    )
}

/** Content on one of the kit's full-colour blocks, where text is ink. */
@Composable
fun OnColour(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalInk provides Theme.Ink, content = content)
}

/** A labelled bar on an ink track. */
@Composable
fun Meter(label: String, value: String, fraction: Double, colour: Color?, modifier: Modifier = Modifier, dimLabel: Boolean = false) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            T(plain(label), TypeStyle.Small, Modifier.weight(1f), color = if (dimLabel) Theme.Muted else Theme.Paper)
            T(value, TypeStyle.Small, color = Theme.Muted)
        }
        Box(Modifier.fillMaxWidth().heightIn(min = 12.dp).background(Theme.Ink, CircleShape)) {
            if (colour != null && fraction > 0) {
                Box(Modifier.fillMaxWidth(fraction.coerceIn(0.0, 1.0).toFloat()).heightIn(min = 12.dp).background(colour, CircleShape))
            }
        }
    }
}

@Composable
fun CardColumn(modifier: Modifier = Modifier, padding: Dp = 21.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.card(padding), content = content)
}

/** Only paired markdown markers go, so code like "2 ** 3" survives. The same rule as `plainText` in the web app. */
fun plain(text: String): String =
    text.replace(Regex("""\*\*(\S(?:.*?\S)?)\*\*"""), "$1").replace(Regex("""`([^`\n]+)`"""), "$1")

fun percent(value: Double?): String = if (value == null) "–" else "${Math.round(value * 100)}%"

fun plural(count: Int, word: String): String = "$count $word${if (count == 1) "" else "s"}"
