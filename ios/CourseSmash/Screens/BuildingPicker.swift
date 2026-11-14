import SwiftUI

/// The learner restyles a course's building. The choices and their names come from /api/app.
struct BuildingPicker: View {
    let view: CourseDetail
    let onSaved: (Icon) -> Void
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var spec: Icon
    @State private var choices: AppConfig.Buildings?
    @State private var error: String?
    @State private var saving = false

    init(view: CourseDetail, onSaved: @escaping (Icon) -> Void) {
        self.view = view
        self.onSaved = onSaved
        _spec = State(initialValue: CityEngine.shared.spec(view.art))
    }

    private var progress: ArtProgress {
        // Same as progressOf() for a course that has its outline.
        let floors = view.modules.isEmpty ? 4 : view.modules.count
        return ArtProgress(floors: floors, lit: view.status == "complete" ? floors : view.passed)
    }

    private func subject(_ icon: Icon) -> ArtSubject {
        ArtSubject(id: view.id, title: view.title, icon: icon)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Change building").type(.titleLarge).accessibilityAddTraits(.isHeader)
                        Text(RichText.plain(view.name)).type(.body).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    Button("Close") { dismiss() }.buttonStyle(LinkButtonStyle())
                }

                HStack(spacing: 14) {
                    BuildingArt(subject: subject(spec), progress: progress)
                        .padding(16)
                        .frame(width: 140, height: 140)
                        .inset()
                    Button("Surprise me", action: shuffle)
                        .buttonStyle(PillButtonStyle(kind: .ink))
                        .accessibilityIdentifier("surprise-me")
                }

                if let choices {
                    group("Building") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
                            ForEach(choices.archetypes) { item in
                                artPick(item, on: spec.archetype == item.id, subject: subject(Icon(archetype: item.id, material: spec.material, roof: "none", accent: spec.accent)), progress: ArtProgress(floors: 4, lit: 2), height: 72) { spec.archetype = item.id }
                                    .accessibilityIdentifier("archetype-\(item.id)")
                            }
                        }
                    }
                    group("Material") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], spacing: 8) {
                            ForEach(choices.materials) { item in
                                artPick(item, on: spec.material == item.id, subject: subject(Icon(archetype: "tower", material: item.id, roof: "none", accent: spec.accent)), progress: ArtProgress(floors: 3, lit: 0), height: 52) { spec.material = item.id }
                            }
                        }
                    }
                    group("Roof") {
                        FlowLayout(spacing: 8) {
                            ForEach(choices.roofs) { item in
                                Button(item.label) { spec.roof = item.id }
                                    .buttonStyle(ChipButtonStyle(on: spec.roof == item.id, minHeight: 40))
                                    .accessibilityAddTraits(spec.roof == item.id ? .isSelected : [])
                            }
                        }
                    }
                    group("Trim colour") {
                        FlowLayout(spacing: 8) {
                            ForEach(choices.accents) { item in
                                Button { spec.accent = item.id } label: {
                                    Circle().fill(Theme.accent(item.id)).frame(width: 26, height: 26)
                                        .frame(width: 48, height: 48)
                                        .background(Theme.ink, in: Circle())
                                        .overlay { if spec.accent == item.id { Circle().strokeBorder(Theme.yellow, lineWidth: 3) } }
                                }
                                .buttonStyle(LiftButtonStyle(lift: 2))
                                .accessibilityLabel(item.label)
                                .accessibilityAddTraits(spec.accent == item.id ? .isSelected : [])
                            }
                        }
                    }
                }

                if let error { ErrorText(message: error) }
                FlowLayout(spacing: 14) {
                    Button("Save building", action: save)
                        .buttonStyle(PillButtonStyle())
                        .disabled(saving || choices == nil)
                        .accessibilityIdentifier("save-building")
                    Button("Cancel") { dismiss() }.buttonStyle(PillButtonStyle(kind: .ink))
                }
            }
            .padding(20)
        }
        .background(Theme.surface)
        .foregroundStyle(Theme.paper)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Theme.panelRadius)
        .task {
            do {
                choices = try await app.loadConfig().buildings
            } catch {
                self.error = message(of: error)
            }
        }
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).type(.smallMedium).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func artPick(_ item: AppConfig.Choice, on: Bool, subject: ArtSubject, progress: ArtProgress, height: CGFloat, choose: @escaping () -> Void) -> some View {
        Button(action: choose) {
            VStack(spacing: 4) {
                BuildingArt(subject: subject, progress: progress).frame(height: height)
                Text(item.label).type(.caption).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.horizontal, 6).padding(.top, 8).padding(.bottom, 10)
            .frame(maxWidth: .infinity)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay { if on { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.yellow, lineWidth: 3) } }
        }
        .buttonStyle(LiftButtonStyle(lift: 2))
        .accessibilityLabel(item.label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func shuffle() {
        guard let choices else { return }
        spec = Icon(archetype: choices.archetypes.randomElement()?.id ?? spec.archetype,
                    material: choices.materials.randomElement()?.id ?? spec.material,
                    roof: choices.roofs.randomElement()?.id ?? spec.roof,
                    accent: choices.accents.randomElement()?.id ?? spec.accent)
    }

    private func save() {
        saving = true
        error = nil
        Task {
            do {
                struct Body: Encodable { let icon: Icon }
                let saved: IconSaved = try await app.api.send("PUT", "/api/courses/\(view.id)/icon", body: Body(icon: spec))
                onSaved(saved.icon)
                UIAccessibility.post(notification: .announcement, argument: "Building saved.")
                dismiss()
            } catch {
                self.error = message(of: error)
                saving = false
            }
        }
    }
}
