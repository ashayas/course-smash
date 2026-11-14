import SwiftMath
import SwiftUI
import UIKit

/// Text the models wrote. Paired markdown markers are dropped and LaTeX inside \( \) or \[ \] is typeset,
/// the same rules as `plainText` and `rich` in the web app.
struct RichText: View {
    let source: String
    var style: TypeStyle = .body

    init(_ source: String, style: TypeStyle = .body) {
        self.source = source
        self.style = style
    }

    var body: some View {
        let pieces = RichText.pieces(of: source)
        let hasMath = pieces.contains { if case .math = $0 { return true } else { return false } }
        pieces.reduce(Text("")) { text, piece in
            switch piece {
            case let .text(string):
                return text + Text(string)
            case let .math(tex, display):
                guard let formula = MathRenderer.shared.image(tex: tex, display: display, size: style.size) else { return text + Text(tex) }
                let inline = Text(Image(uiImage: formula.image).renderingMode(.template)).baselineOffset(-formula.descent)
                return display ? text + Text("\n") + inline + Text("\n") : text + inline
            }
        }
        .type(style)
        .accessibilityLabel(hasMath ? Text(RichText.plain(source)) : Text(pieces.map(\.spoken).joined()))
    }

    enum Piece {
        case text(String)
        case math(String, display: Bool)

        var spoken: String {
            switch self {
            case let .text(string): return string
            case let .math(tex, _): return tex
            }
        }
    }

    /// Only paired markers go, so code like "2 ** 3" survives.
    static func plain(_ text: String) -> String {
        text.replacingOccurrences(of: #"\*\*(\S(?:.*?\S)?)\*\*"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: #"`([^`\n]+)`"#, with: "$1", options: .regularExpression)
    }

    private static let math = try! NSRegularExpression(pattern: #"\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]"#)

    static func pieces(of source: String) -> [Piece] {
        let whole = source as NSString
        var pieces: [Piece] = []
        var last = 0
        for match in math.matches(in: source, range: NSRange(location: 0, length: whole.length)) {
            if match.range.location > last { pieces.append(.text(plain(whole.substring(with: NSRange(location: last, length: match.range.location - last))))) }
            let display = match.range(at: 2).location != NSNotFound
            pieces.append(.math(whole.substring(with: match.range(at: display ? 2 : 1)), display: display))
            last = match.range.location + match.range.length
        }
        if last < whole.length { pieces.append(.text(plain(whole.substring(from: last)))) }
        return pieces
    }
}

/// Typesets LaTeX into an image that sits on the text baseline. Formulas that don't parse fall back to their source.
@MainActor
final class MathRenderer {
    static let shared = MathRenderer()

    struct Formula {
        let image: UIImage
        let descent: CGFloat
    }

    private var cache: [String: Formula?] = [:]

    func image(tex: String, display: Bool, size: CGFloat) -> Formula? {
        let key = "\(display)|\(size)|\(tex)"
        if let cached = cache[key] { return cached }
        let formula = render(tex: tex, display: display, size: size)
        cache[key] = formula
        return formula
    }

    private func render(tex: String, display: Bool, size: CGFloat) -> Formula? {
        let label = MTMathUILabel()
        label.fontSize = size * 1.05
        label.labelMode = display ? .display : .text
        label.textAlignment = .left
        label.textColor = .black
        label.latex = tex
        let fitted = label.intrinsicContentSize
        guard label.error == nil, fitted.width > 0, fitted.height > 0, fitted.width < 4000 else { return nil }
        label.frame = CGRect(origin: .zero, size: fitted)
        label.layoutIfNeeded()
        guard let line = label.displayList else { return nil }
        let image = UIGraphicsImageRenderer(size: fitted).image { renderer in
            let context = renderer.cgContext
            context.translateBy(x: 0, y: fitted.height)
            context.scaleBy(x: 1, y: -1)
            line.draw(context)
        }
        return Formula(image: image, descent: line.descent)
    }
}
