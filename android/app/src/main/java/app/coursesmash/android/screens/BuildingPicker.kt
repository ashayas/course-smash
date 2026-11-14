package app.coursesmash.android.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.coursesmash.android.AppConfig
import app.coursesmash.android.AppModel
import app.coursesmash.android.CourseDetail
import app.coursesmash.android.Icon
import app.coursesmash.android.IconSaved
import app.coursesmash.android.art.Art
import app.coursesmash.android.art.ArtProgress
import app.coursesmash.android.art.ArtSubject
import app.coursesmash.android.art.art
import app.coursesmash.android.messageOf
import app.coursesmash.android.ui.Chip
import app.coursesmash.android.ui.ErrorText
import app.coursesmash.android.ui.LinkButton
import app.coursesmash.android.ui.Pill
import app.coursesmash.android.ui.PillButton
import app.coursesmash.android.ui.T
import app.coursesmash.android.ui.Theme
import app.coursesmash.android.ui.TypeStyle
import app.coursesmash.android.ui.inset
import app.coursesmash.android.ui.lift
import app.coursesmash.android.ui.plain
import app.coursesmash.android.ui.tag
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement

/** The learner restyles a course's building. The choices and their names come from /api/app. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BuildingPicker(app: AppModel, view: CourseDetail, onClose: () -> Unit, onSaved: (Icon) -> Unit) {
    var spec by remember { mutableStateOf(view.icon) }
    var choices by remember { mutableStateOf<AppConfig.Buildings?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val announcer = LocalView.current

    LaunchedEffect(Unit) {
        // The building a course has now: its saved icon, or the one city.js picks from its topic.
        if (spec == null) spec = app.city.spec(view.art)
        try {
            choices = app.loadConfig().buildings
        } catch (failure: Exception) {
            error = messageOf(failure)
        }
    }

    // Same as progressOf() for a course that has its outline.
    val floors = if (view.modules.isEmpty()) 4 else view.modules.size
    val progress = ArtProgress(floors, if (view.status == "complete") floors else view.passed)
    fun subject(icon: Icon) = ArtSubject(view.id, view.title, icon = icon)

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.fillMaxSize().padding(top = 28.dp)
                .background(Theme.Surface, RoundedCornerShape(topStart = Theme.PanelRadius, topEnd = Theme.PanelRadius))
                .verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    T("Change building", TypeStyle.TitleLarge, heading = true)
                    T(plain(view.name), TypeStyle.Body, color = Theme.Muted)
                }
                LinkButton("Close", onClose)
            }

            val current = spec
            val options = choices
            if (current != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(140.dp).inset().padding(16.dp)) {
                        Art(app.city, app.city.building(subject(current), progress), Modifier.fillMaxSize().clearAndSetSemantics {})
                    }
                    PillButton("Surprise me", {
                        options?.let { spec = Icon(it.archetypes.random().id, it.materials.random().id, it.roofs.random().id, it.accents.random().id) }
                    }, kind = Pill.Ink, tag = "surprise-me")
                }
            }

            if (current != null && options != null) {
                Group("Building") {
                    Grid(options.archetypes, columns = 3) { item ->
                        ArtPick(app, item, current.archetype == item.id, subject(current.copy(archetype = item.id, roof = "none")), ArtProgress(4, 2), 72, "archetype-${item.id}") { spec = current.copy(archetype = item.id) }
                    }
                }
                Group("Material") {
                    Grid(options.materials, columns = 4) { item ->
                        ArtPick(app, item, current.material == item.id, subject(Icon("tower", item.id, "none", current.accent)), ArtProgress(3, 0), 52, null) { spec = current.copy(material = item.id) }
                    }
                }
                Group("Roof") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (item in options.roofs) Chip(item.label, { spec = current.copy(roof = item.id) }, on = current.roof == item.id, minHeight = 40.dp)
                    }
                }
                Group("Trim colour") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (item in options.accents) {
                            val on = current.accent == item.id
                            Box(
                                Modifier.size(48.dp).background(Theme.Ink, CircleShape)
                                    .then(if (on) Modifier.border(3.dp, Theme.Yellow, CircleShape) else Modifier)
                                    .clickable(remember { MutableInteractionSource() }, indication = null, role = Role.RadioButton) { spec = current.copy(accent = item.id) }
                                    .semantics { contentDescription = item.label; selected = on },
                                contentAlignment = Alignment.Center,
                            ) {
                                Box(Modifier.size(26.dp).background(Theme.accent(item.id), CircleShape))
                            }
                        }
                    }
                }
            }

            error?.let { ErrorText(it) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                PillButton("Save building", {
                    val icon = spec ?: return@PillButton
                    saving = true
                    error = null
                    scope.launch {
                        try {
                            val body = buildJsonObject { put("icon", app.api.json.encodeToJsonElement(icon)) }
                            val saved: IconSaved = app.api.send("PUT", "/api/courses/${view.id}/icon", body.toString())
                            onSaved(saved.icon)
                            announcer.announceForAccessibility("Building saved.")
                            onClose()
                        } catch (failure: Exception) {
                            error = messageOf(failure)
                            saving = false
                        }
                    }
                }, enabled = !saving && spec != null && choices != null, tag = "save-building")
                PillButton("Cancel", onClose, kind = Pill.Ink)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        T(title, TypeStyle.SmallMedium, heading = true)
        content()
    }
}

/** Rows of equal columns. The lists here are short and fixed, so nothing needs to be lazy. */
@Composable
private fun <Item> Grid(items: List<Item>, columns: Int, cell: @Composable (Item) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in items.chunked(columns)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (item in row) Box(Modifier.weight(1f)) { cell(item) }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun ArtPick(app: AppModel, item: AppConfig.Choice, on: Boolean, subject: ArtSubject, progress: ArtProgress, height: Int, tag: String?, choose: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    Column(
        Modifier.tag(tag).fillMaxWidth().lift(source, 2.dp).background(Theme.Ink, RoundedCornerShape(16.dp))
            .then(if (on) Modifier.border(3.dp, Theme.Yellow, RoundedCornerShape(16.dp)) else Modifier)
            .clickable(source, indication = null, role = Role.RadioButton, onClick = choose)
            .semantics { contentDescription = item.label; selected = on }
            .padding(start = 6.dp, end = 6.dp, top = 8.dp, bottom = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Art(app.city, app.city.building(subject, progress), Modifier.fillMaxWidth().height(height.dp).clearAndSetSemantics {})
        T(item.label, TypeStyle.Caption, align = TextAlign.Center, maxLines = 1)
    }
}
