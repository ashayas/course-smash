import SwiftUI

/// The Course Smash city design kit (DESIGN.md): colours, type and shapes.
enum Theme {
    // Neutrals
    static let ink = Color(hex: 0x141414)
    static let surface = Color(hex: 0x1F1F1D)
    static let paper = Color(hex: 0xFBFBFB)
    static let muted = Color(hex: 0xA3A3A0)
    // Accents
    static let orange = Color(hex: 0xE65F2B)
    static let yellow = Color(hex: 0xF5D556)
    static let green = Color(hex: 0x469B5B)
    static let blue = Color(hex: 0x5889F7)
    static let purple = Color(hex: 0x904CF6)
    static let pink = Color(hex: 0xE7A0EA)
    // Trim colours that only the buildings use.
    static let red = Color(hex: 0xC8402F)
    static let teal = Color(hex: 0x4FA39D)
    // Chart rules.
    static let gridLine = Color(hex: 0x2C2C29)
    static let baseLine = Color(hex: 0x3A3A37)

    static let cardRadius: CGFloat = 28
    static let panelRadius: CGFloat = 36
    static let insetRadius: CGFloat = 20
    /// Phone layout: the web app's gutter and gap below 680px.
    static let gutter: CGFloat = 16
    static let gap: CGFloat = 16

    /// The kit's springy easing with a slight overshoot.
    static let spring = Animation.spring(response: 0.32, dampingFraction: 0.55)

    static func accent(_ name: String) -> Color {
        switch name {
        case "orange": return orange
        case "yellow": return yellow
        case "green": return green
        case "blue": return blue
        case "pink": return pink
        case "purple": return purple
        case "red": return red
        case "teal": return teal
        default: return muted
        }
    }

    /// Green at 70% and over, yellow from 40%, orange below. Used by every meter.
    static func score(_ value: Double) -> Color {
        value >= 0.7 ? green : value >= 0.4 ? yellow : orange
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: 1)
    }
}

/// Inter Tight in the four weights the kit uses.
enum InterTight: String {
    case regular = "InterTight-Regular"
    case medium = "InterTight-Medium"
    case semibold = "InterTight-SemiBold"
    case extrabold = "InterTight-ExtraBold"
}

/// One row of the kit's type table.
struct TypeStyle {
    var size: CGFloat
    var weight: InterTight = .regular
    /// Letter spacing in em.
    var tracking: CGFloat = -0.01
    /// Line height as a multiple of the size.
    var leading: CGFloat = 1.35
    var relativeTo: Font.TextStyle = .body

    static let hero = TypeStyle(size: 52, weight: .extrabold, tracking: -0.055, leading: 0.92, relativeTo: .largeTitle)
    static let loginHero = TypeStyle(size: 48, weight: .extrabold, tracking: -0.055, leading: 0.92, relativeTo: .largeTitle)
    static let section = TypeStyle(size: 40, weight: .semibold, tracking: -0.04, leading: 1.05, relativeTo: .largeTitle)
    static let titleLarge = TypeStyle(size: 35, weight: .semibold, tracking: -0.03, leading: 1.05, relativeTo: .title)
    static let titleSmall = TypeStyle(size: 25, weight: .semibold, tracking: -0.03, leading: 1.05, relativeTo: .title2)
    static let question = TypeStyle(size: 25, weight: .semibold, tracking: -0.03, leading: 1.1, relativeTo: .title2)
    static let lead = TypeStyle(size: 22, relativeTo: .title3)
    static let body = TypeStyle(size: 19)
    static let small = TypeStyle(size: 16, relativeTo: .callout)
    static let smallMedium = TypeStyle(size: 16, weight: .medium, relativeTo: .callout)
    static let button = TypeStyle(size: 16, weight: .medium, tracking: 0, relativeTo: .callout)
    static let caption = TypeStyle(size: 14, relativeTo: .footnote)
    static let tiny = TypeStyle(size: 13, relativeTo: .caption)

    var font: Font { .custom(weight.rawValue, size: size, relativeTo: relativeTo) }
    var uiFont: UIFont {
        UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont(name: weight.rawValue, size: size) ?? .systemFont(ofSize: size))
    }
}

extension View {
    /// Sets font, tracking and line height from the kit's type table.
    func type(_ style: TypeStyle) -> some View {
        font(style.font)
            .tracking(style.size * style.tracking)
            .lineSpacing(max(0, style.size * (style.leading - 1.2)))
    }

    func panel(radius: CGFloat = Theme.panelRadius) -> some View {
        background(Theme.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    func card(padding: CGFloat = 21) -> some View {
        self.padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
    }

    func inset(radius: CGFloat = Theme.insetRadius) -> some View {
        background(Theme.ink, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// The kit's full-pill button: paper by default, quiet on a surface, or ink on colour.
struct PillButtonStyle: ButtonStyle {
    enum Kind { case paper, quiet, ink }
    var kind: Kind = .paper
    var fullWidth = false
    var minHeight: CGFloat = 50
    var padding: CGFloat = 26
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.button)
            .lineLimit(1)
            .padding(.horizontal, padding)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: minHeight)
            .foregroundStyle(kind == .paper ? Theme.ink : Theme.paper)
            .background(kind == .paper ? Theme.paper : kind == .quiet ? Theme.surface : Theme.ink, in: Capsule())
            .opacity(isEnabled ? 1 : 0.55)
            .offset(y: configuration.isPressed && !reduceMotion ? -3 : 0)
            .animation(reduceMotion ? nil : Theme.spring, value: configuration.isPressed)
            .contentShape(Capsule())
    }
}

/// Underlined muted text that acts as a button.
struct LinkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.small)
            .underline()
            .foregroundStyle(configuration.isPressed ? Theme.paper : Theme.muted)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
    }
}

/// A pill chip on ink, or yellow when it is the selected one.
struct ChipButtonStyle: ButtonStyle {
    var on = false
    var minHeight: CGFloat = 44
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.small)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 8)
            .frame(minHeight: minHeight)
            .foregroundStyle(on ? Theme.ink : Theme.paper)
            .background(on ? Theme.yellow : Theme.ink, in: Capsule())
            .offset(y: configuration.isPressed && !reduceMotion ? -2 : 0)
            .animation(reduceMotion ? nil : Theme.spring, value: configuration.isPressed)
    }
}

/// Lifts a card a few points while it is pressed, like the web app's hover.
struct LiftButtonStyle: ButtonStyle {
    var lift: CGFloat = 4
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(y: configuration.isPressed && !reduceMotion ? -lift : 0)
            .animation(reduceMotion ? nil : Theme.spring, value: configuration.isPressed)
    }
}

/// An error on the kit's orange block.
struct ErrorText: View {
    let message: String
    var body: some View {
        Text(message)
            .type(.smallMedium)
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.orange, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .accessibilityAddTraits(.isStaticText)
    }
}

/// A multi-line text box on ink with a placeholder.
struct TextArea: View {
    @Binding var text: String
    var placeholder: String
    var minHeight: CGFloat = 128
    var limit: Int
    var focused: FocusState<Bool>.Binding
    /// What VoiceOver calls the box, and the name UI tests find it by.
    var label: String
    var identifier: String = ""

    var body: some View {
        // The placeholder is part of the layout while it shows, so a long one makes the box taller instead of being cut off.
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .type(.body)
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
            }
            TextEditor(text: $text)
                .focused(focused)
                .type(.body)
                .foregroundStyle(Theme.paper)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 15)
                .padding(.vertical, 8)
                .frame(minHeight: minHeight)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(label)
                .accessibilityIdentifier(identifier)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .contentShape(Rectangle())
        .onTapGesture { focused.wrappedValue = true }
        .inset()
        .onChange(of: text) { _, new in
            if new.count > limit { text = String(new.prefix(limit)) }
        }
    }
}

/// Lays children out in rows that wrap, like `flex-wrap`.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let rows = arrange(subviews, in: width)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(subviews, in: bounds.width) {
            for item in row.items {
                subviews[item.index].place(at: CGPoint(x: bounds.minX + item.x, y: bounds.minY + row.y), proposal: ProposedViewSize(item.size))
            }
        }
    }

    private struct Row { var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0; var items: [(index: Int, x: CGFloat, size: CGSize)] = [] }

    private func arrange(_ subviews: Subviews, in width: CGFloat) -> [Row] {
        var rows = [Row()]
        for (index, subview) in subviews.enumerated() {
            var size = subview.sizeThatFits(.unspecified)
            if size.width > width { size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
            var row = rows[rows.count - 1]
            if !row.items.isEmpty, row.width + spacing + size.width > width {
                rows.append(Row(y: row.y + row.height + spacing))
                row = rows[rows.count - 1]
            }
            let x = row.items.isEmpty ? 0 : row.width + spacing
            row.items.append((index, x, size))
            row.width = x + size.width
            row.height = max(row.height, size.height)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
