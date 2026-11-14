import SwiftUI
import WebKit

/// A question's diagram: SVG a model drew, already sanitised by the Worker (src/figure.ts).
/// It is shown the way the web app shows it, as an image, so nothing inside it can run. JavaScript is off as well.
struct FigureView: View {
    let svg: String
    let alt: String?

    var body: some View {
        if let ratio = FigureView.aspectRatio(of: svg) {
            FigureWeb(svg: svg)
                .aspectRatio(ratio, contentMode: .fit)
                .frame(maxHeight: 460)
                .frame(maxWidth: .infinity)
                .padding(18)
                .background(Theme.paper, in: RoundedRectangle(cornerRadius: Theme.insetRadius, style: .continuous))
                .accessibilityElement()
                .accessibilityLabel(alt?.isEmpty == false ? alt! : "Diagram for this question")
                .accessibilityAddTraits(.isImage)
                .accessibilityIdentifier("figure")
        }
    }

    /// The Worker only keeps figures that have a viewBox.
    static func aspectRatio(of svg: String) -> CGFloat? {
        guard let match = svg.range(of: #"viewBox\s*=\s*["'][^"']+["']"#, options: [.regularExpression, .caseInsensitive]) else { return nil }
        let numbers = svg[match].split(whereSeparator: { !"0123456789.-eE".contains($0) }).compactMap { Double($0) }
        guard numbers.count >= 4, numbers[numbers.count - 2] > 0, numbers[numbers.count - 1] > 0 else { return nil }
        return CGFloat(numbers[numbers.count - 2] / numbers[numbers.count - 1])
    }
}

private struct FigureWeb: UIViewRepresentable {
    let svg: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.scrollView.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.shown != svg else { return }
        context.coordinator.shown = svg
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_.!~*'()"))
        let encoded = svg.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        view.loadHTMLString("""
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
        <style>html, body { margin: 0; height: 100%; background: transparent; } img { display: block; width: 100%; height: 100%; object-fit: contain; }</style>
        </head><body><img alt="" src="data:image/svg+xml;charset=utf-8,\(encoded)"></body></html>
        """, baseURL: nil)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var shown: String? }
}
