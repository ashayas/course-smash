import SwiftUI

// A small SVG reader for the markup public/city.js writes: paths, ellipses, circles, rects and groups,
// with flat fills, strokes, rotate() transforms and the animation classes from styles.css.
// It is not a general SVG renderer. Question figures, which can hold text, go through FigureView.

/// The looping animations in styles.css, by class name.
enum SVGMotion: String {
    case ripple, ferry, blink, smoke, crane, spin, flag, beacon, drop, confetti
}

final class SVGNode {
    /// Nil for a group.
    var path: Path?
    var children: [SVGNode] = []
    var fill: Color?
    var stroke: Color?
    var strokeStyle = StrokeStyle(lineWidth: 1)
    var opacity: Double = 1
    var transform: CGAffineTransform = .identity
    var motion: SVGMotion?
    /// `animation-delay`, from the d0 to d4 classes.
    var delay: Double = 0
    /// The `transform-origin` attribute, in user units.
    var origin: CGPoint?
    /// `data-lot`: a course's index in the city, or "new" for the building site.
    var lot: String?
    /// Bounds of what this node draws, before its own transform.
    var bounds: CGRect = .null
}

final class SVGDocument {
    let viewBox: CGRect
    let nodes: [SVGNode]
    let animated: Bool
    /// Tappable city lots, in drawing order.
    let lots: [SVGNode]

    init(viewBox: CGRect, nodes: [SVGNode]) {
        self.viewBox = viewBox
        self.nodes = nodes
        var animated = false
        var lots: [SVGNode] = []
        func walk(_ node: SVGNode) {
            if node.motion != nil { animated = true }
            if node.lot != nil { lots.append(node) }
            node.children.forEach(walk)
        }
        nodes.forEach(walk)
        self.animated = animated
        self.lots = lots
    }

    var aspectRatio: CGFloat { viewBox.height > 0 ? viewBox.width / viewBox.height : 1 }

    /// The lot under a point given in user units, front-most first.
    func lot(at point: CGPoint) -> String? {
        for node in lots.reversed() where node.bounds.contains(point) {
            if SVGDocument.hit(node, point, .identity) { return node.lot }
        }
        return nil
    }

    private static func hit(_ node: SVGNode, _ point: CGPoint, _ parent: CGAffineTransform) -> Bool {
        let transform = node.transform.concatenating(parent)
        if let path = node.path { return node.fill != nil && path.applying(transform).contains(point) }
        return node.children.contains { hit($0, point, transform) }
    }
}

final class SVGParser: NSObject, XMLParserDelegate {
    private var stack: [SVGNode] = [SVGNode()]
    private var viewBox = CGRect.zero

    static func parse(_ markup: String) -> SVGDocument? {
        let reader = SVGParser()
        let parser = XMLParser(data: Data(markup.utf8))
        parser.delegate = reader
        guard parser.parse(), reader.viewBox.width > 0, reader.viewBox.height > 0 else { return nil }
        let root = reader.stack[0]
        for child in root.children { measure(child) }
        return SVGDocument(viewBox: reader.viewBox, nodes: root.children)
    }

    @discardableResult
    private static func measure(_ node: SVGNode) -> CGRect {
        if let path = node.path {
            node.bounds = path.boundingRect
        } else {
            node.bounds = node.children.reduce(CGRect.null) { $0.union(measure($1)) }
        }
        return node.bounds.isNull ? .null : node.bounds.applying(node.transform)
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String]) {
        func number(_ key: String) -> CGFloat { CGFloat(Double(a[key] ?? "") ?? 0) }
        let node = SVGNode()
        switch name {
        case "svg":
            let v = (a["viewBox"] ?? "").split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }
            if v.count == 4 { viewBox = CGRect(x: v[0], y: v[1], width: v[2], height: v[3]) }
            return
        case "g":
            break
        case "path":
            node.path = Path(SVGPath.parse(a["d"] ?? ""))
        case "ellipse":
            node.path = Path(ellipseIn: CGRect(x: number("cx") - number("rx"), y: number("cy") - number("ry"), width: number("rx") * 2, height: number("ry") * 2))
        case "circle":
            node.path = Path(ellipseIn: CGRect(x: number("cx") - number("r"), y: number("cy") - number("r"), width: number("r") * 2, height: number("r") * 2))
        case "rect":
            let rect = CGRect(x: number("x"), y: number("y"), width: number("width"), height: number("height"))
            node.path = a["rx"] == nil ? Path(rect) : Path(roundedRect: rect, cornerRadius: number("rx"))
        default:
            return
        }

        if node.path != nil {
            let stroke = SVGParser.color(a["stroke"])
            node.stroke = stroke
            // Unfilled strokes in city.js are lines, so a missing fill only means black when there is no stroke.
            node.fill = a["fill"] == nil ? (stroke == nil ? .black : nil) : SVGParser.color(a["fill"])
            if stroke != nil {
                let dash = (a["stroke-dasharray"] ?? "").split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }.map { CGFloat($0) }
                node.strokeStyle = StrokeStyle(lineWidth: a["stroke-width"].flatMap { Double($0) }.map { CGFloat($0) } ?? 1,
                                               lineCap: a["stroke-linecap"] == "round" ? .round : .butt, dash: dash)
            }
        }
        if let value = a["opacity"], let opacity = Double(value) { node.opacity = opacity }
        if let value = a["transform"] { node.transform = SVGParser.transform(value) }
        if let value = a["transform-origin"] {
            let o = value.split(separator: " ").compactMap { Double($0) }
            if o.count == 2 { node.origin = CGPoint(x: o[0], y: o[1]) }
        }
        node.lot = a["data-lot"]
        for word in (a["class"] ?? "").split(separator: " ") {
            if let motion = SVGMotion(rawValue: String(word)) { node.motion = motion }
            // The skyline at the back of the city sits a little behind everything else.
            else if word == "filler" { node.opacity *= 0.9 }
            else if word.count == 2, word.first == "d", let step = Int(word.dropFirst()) { node.delay = Double(step) }
        }
        // Delay classes count steps: 0.8s for ripples and confetti, 0.32s for the loader's floors.
        node.delay *= node.motion == .drop ? 0.32 : 0.8

        stack[stack.count - 1].children.append(node)
        if name == "g" { stack.append(node) }
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if name == "g", stack.count > 1 { stack.removeLast() }
    }

    private static var colors: [String: Color] = [:]

    private static func color(_ value: String?) -> Color? {
        guard let value, value != "none" else { return nil }
        if let known = colors[value] { return known }
        guard value.hasPrefix("#"), value.count == 7, let hex = UInt32(value.dropFirst(), radix: 16) else { return nil }
        let color = Color(hex: hex)
        colors[value] = color
        return color
    }

    /// Only rotate(angle cx cy) appears in city.js.
    private static func transform(_ value: String) -> CGAffineTransform {
        guard value.hasPrefix("rotate("), value.hasSuffix(")") else { return .identity }
        let n = value.dropFirst(7).dropLast().split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }
        guard let angle = n.first else { return .identity }
        let centre = n.count == 3 ? CGPoint(x: n[1], y: n[2]) : .zero
        return CGAffineTransform(translationX: centre.x, y: centre.y).rotated(by: angle * .pi / 180).translatedBy(x: -centre.x, y: -centre.y)
    }
}

/// Path data: M L H V Q C A Z and their relative forms.
enum SVGPath {
    static func parse(_ data: String) -> CGPath {
        let path = CGMutablePath()
        var scanner = Scanner(data)
        var current = CGPoint.zero
        var start = CGPoint.zero
        var command: Character = " "
        while true {
            scanner.skipSeparators()
            if let next = scanner.command() { command = next } else if scanner.atEnd { break }
            if command == " " { break }
            let relative = command.isLowercase
            func point() -> CGPoint? {
                guard let x = scanner.number(), let y = scanner.number() else { return nil }
                return relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
            }
            switch command.uppercased() {
            case "M":
                guard let p = point() else { return path }
                path.move(to: p); current = p; start = p
                command = relative ? "l" : "L" // further pairs are lines
            case "L":
                guard let p = point() else { return path }
                path.addLine(to: p); current = p
            case "H":
                guard let x = scanner.number() else { return path }
                current.x = relative ? current.x + x : x
                path.addLine(to: current)
            case "V":
                guard let y = scanner.number() else { return path }
                current.y = relative ? current.y + y : y
                path.addLine(to: current)
            case "Q":
                guard let c = point(), let p = point() else { return path }
                path.addQuadCurve(to: p, control: c); current = p
            case "C":
                guard let c1 = point(), let c2 = point(), let p = point() else { return path }
                path.addCurve(to: p, control1: c1, control2: c2); current = p
            case "A":
                guard let rx = scanner.number(), let ry = scanner.number(), let rotation = scanner.number(),
                      let large = scanner.flag(), let sweep = scanner.flag(), let p = point() else { return path }
                arc(path, from: current, to: p, rx: rx, ry: ry, rotation: rotation, large: large, sweep: sweep)
                current = p
            case "Z":
                path.closeSubpath(); current = start
                command = " "
            default:
                return path
            }
        }
        return path
    }

    /// The endpoint form of an elliptical arc, converted to centre form (SVG 1.1, appendix F.6.5).
    private static func arc(_ path: CGMutablePath, from p0: CGPoint, to p1: CGPoint, rx: CGFloat, ry: CGFloat, rotation: CGFloat, large: Bool, sweep: Bool) {
        var rx = abs(rx), ry = abs(ry)
        guard rx > 0, ry > 0, p0 != p1 else { path.addLine(to: p1); return }
        let phi = rotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1 = cosPhi * dx + sinPhi * dy, y1 = -sinPhi * dx + cosPhi * dy
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 { rx *= sqrt(lambda); ry *= sqrt(lambda) }
        let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
        let factor = (large == sweep ? -1 : 1) * sqrt(max(0, numerator / denominator))
        let cx1 = factor * rx * y1 / ry, cy1 = -factor * ry * x1 / rx
        let centre = CGPoint(x: cosPhi * cx1 - sinPhi * cy1 + (p0.x + p1.x) / 2, y: sinPhi * cx1 + cosPhi * cy1 + (p0.y + p1.y) / 2)
        let theta1 = atan2((y1 - cy1) / ry, (x1 - cx1) / rx)
        var delta = atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - theta1
        if sweep, delta < 0 { delta += 2 * .pi } else if !sweep, delta > 0 { delta -= 2 * .pi }
        let transform = CGAffineTransform(translationX: centre.x, y: centre.y).rotated(by: phi).scaledBy(x: rx, y: ry)
        path.addArc(center: .zero, radius: 1, startAngle: theta1, endAngle: theta1 + delta, clockwise: delta < 0, transform: transform)
    }

    private struct Scanner {
        private let bytes: [UInt8]
        private var index = 0
        init(_ text: String) { bytes = Array(text.utf8) }

        var atEnd: Bool { index >= bytes.count }

        mutating func skipSeparators() {
            while index < bytes.count, bytes[index] == 32 || bytes[index] == 44 || bytes[index] == 10 || bytes[index] == 9 { index += 1 }
        }

        mutating func command() -> Character? {
            guard index < bytes.count else { return nil }
            let byte = bytes[index]
            let isLetter = (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)
            guard isLetter, byte != 101, byte != 69 else { return nil } // e and E belong to numbers
            index += 1
            return Character(UnicodeScalar(byte))
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            let begin = index
            if index < bytes.count, bytes[index] == 45 || bytes[index] == 43 { index += 1 }
            var seenDot = false
            while index < bytes.count {
                let byte = bytes[index]
                if byte >= 48 && byte <= 57 { index += 1 }
                else if byte == 46, !seenDot { seenDot = true; index += 1 }
                else if byte == 101 || byte == 69, index + 1 < bytes.count {
                    index += 1
                    if bytes[index] == 45 || bytes[index] == 43 { index += 1 }
                } else { break }
            }
            guard index > begin, let value = Double(String(decoding: bytes[begin..<index], as: UTF8.self)) else { index = begin; return nil }
            return CGFloat(value)
        }

        /// Arc flags are single digits and may run together.
        mutating func flag() -> Bool? {
            skipSeparators()
            guard index < bytes.count, bytes[index] == 48 || bytes[index] == 49 else { return nil }
            index += 1
            return bytes[index - 1] == 49
        }
    }
}
