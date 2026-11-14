import SwiftUI

/// Draws a city.js drawing, scaled to fit and centred, with the same looping motion as the web app.
struct SVGView: View {
    let document: SVGDocument
    /// The slow up-and-down drift the web app gives the hero city.
    var floats = false
    /// Called with a lot's `data-lot` value when the learner taps a building in the city.
    var onTapLot: ((String) -> Void)?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// UI tests pass `-still` so the app settles between taps. Reduce Motion has the same effect for a learner.
    private static let still = ProcessInfo.processInfo.arguments.contains("-still")

    var body: some View {
        Group {
            if (document.animated || floats) && !reduceMotion && !SVGView.still {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                    canvas(time: timeline.date.timeIntervalSinceReferenceDate)
                }
            } else {
                canvas(time: nil)
            }
        }
        .overlay {
            if let onTapLot {
                GeometryReader { proxy in
                    Color.clear.contentShape(Rectangle()).onTapGesture { location in
                        let fit = SVGView.fit(document.viewBox, in: proxy.size)
                        let point = CGPoint(x: (location.x - fit.offset.x) / fit.scale + document.viewBox.minX,
                                            y: (location.y - fit.offset.y) / fit.scale + document.viewBox.minY)
                        if let lot = document.lot(at: point) { onTapLot(lot) }
                    }
                }
            }
        }
    }

    private func canvas(time: Double?) -> some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let fit = SVGView.fit(document.viewBox, in: size)
            var context = context
            var drift: CGFloat = 0
            if floats, let time { drift = -8 * SVGClock.swing(time, period: 8) }
            context.translateBy(x: fit.offset.x, y: fit.offset.y + drift)
            context.scaleBy(x: fit.scale, y: fit.scale)
            context.translateBy(x: -document.viewBox.minX, y: -document.viewBox.minY)
            for node in document.nodes { SVGView.draw(node, in: context, time: time) }
        }
    }

    /// `preserveAspectRatio="xMidYMid meet"`.
    static func fit(_ viewBox: CGRect, in size: CGSize) -> (scale: CGFloat, offset: CGPoint) {
        let scale = min(size.width / viewBox.width, size.height / viewBox.height)
        return (scale, CGPoint(x: (size.width - viewBox.width * scale) / 2, y: (size.height - viewBox.height * scale) / 2))
    }

    private static func draw(_ node: SVGNode, in parent: GraphicsContext, time: Double?) {
        var context = parent
        var opacity = node.opacity
        if let motion = node.motion, let time {
            let frame = SVGClock.frame(motion, node: node, time: time)
            context.concatenate(frame.transform)
            opacity *= frame.opacity
        }
        if !node.transform.isIdentity { context.concatenate(node.transform) }
        if opacity <= 0.001 { return }

        if let path = node.path {
            context.opacity *= opacity
            if let fill = node.fill { context.fill(path, with: .color(fill)) }
            if let stroke = node.stroke { context.stroke(path, with: .color(stroke), style: node.strokeStyle) }
        } else if opacity < 0.999 {
            // A see-through group is flattened first, so its own parts don't show through each other.
            context.opacity *= opacity
            context.drawLayer { layer in
                layer.opacity = 1
                for child in node.children { draw(child, in: layer, time: time) }
            }
        } else {
            for child in node.children { draw(child, in: context, time: time) }
        }
    }
}

/// The keyframes from styles.css, worked out for a moment in time.
enum SVGClock {
    struct Frame {
        var transform = CGAffineTransform.identity
        var opacity: Double = 1
    }

    /// 0 to 1 and back over one period with ease-in-out on each half: a keyframe at 50%.
    static func swing(_ time: Double, period: Double, delay: Double = 0) -> Double {
        let p = phase(time, period: period, delay: delay)
        return Bezier.easeInOut(p < 0.5 ? p * 2 : (1 - p) * 2)
    }

    static func phase(_ time: Double, period: Double, delay: Double = 0) -> Double {
        let p = ((time - delay) / period).truncatingRemainder(dividingBy: 1)
        return p < 0 ? p + 1 : p
    }

    static func frame(_ motion: SVGMotion, node: SVGNode, time: Double) -> Frame {
        var frame = Frame()
        let origin = node.origin ?? .zero
        func about(_ point: CGPoint, _ transform: CGAffineTransform) -> CGAffineTransform {
            CGAffineTransform(translationX: -point.x, y: -point.y).concatenating(transform).concatenating(CGAffineTransform(translationX: point.x, y: point.y))
        }
        switch motion {
        case .ripple:
            let f = swing(time, period: 4, delay: node.delay)
            frame.transform = CGAffineTransform(translationX: 6 * f, y: 0)
            frame.opacity = 1 - 0.65 * f
        case .ferry:
            let f = swing(time, period: 7)
            frame.transform = CGAffineTransform(translationX: 10 * f, y: 5 * f)
        case .blink:
            // steps(2, jump-none): on, off, off, on.
            let p = phase(time, period: 1.6)
            frame.opacity = p < 0.25 || p >= 0.75 ? 1 : 0.2
        case .smoke:
            let p = phase(time, period: 3.2)
            let travel = Bezier.easeInOut(p)
            frame.transform = CGAffineTransform(translationX: 6 * travel, y: 6 - 16 * travel)
            frame.opacity = p < 0.4 ? Bezier.easeInOut(p / 0.4) : 1 - Bezier.easeInOut((p - 0.4) / 0.6)
        case .crane:
            // Sways about the bottom-left corner of its own box.
            let f = swing(time, period: 5)
            let foot = node.bounds.isNull ? CGPoint.zero : CGPoint(x: node.bounds.minX, y: node.bounds.maxY)
            frame.transform = about(foot, CGAffineTransform(rotationAngle: -1.5 * .pi / 180 * f))
        case .spin:
            frame.transform = about(origin, CGAffineTransform(rotationAngle: 2 * .pi * phase(time, period: 7)))
        case .flag:
            // skewY(-6deg) scaleX(.92) at the halfway point.
            let f = swing(time, period: 2.6)
            let skew = CGAffineTransform(a: 1, b: tan(-6 * .pi / 180 * f), c: 0, d: 1, tx: 0, ty: 0)
            frame.transform = about(origin, CGAffineTransform(scaleX: 1 - 0.08 * f, y: 1).concatenating(skew))
        case .beacon:
            frame.opacity = 1 - 0.75 * swing(time, period: 3.2)
        case .drop:
            // A floor falls into place, holds, then fades before the next round.
            let p = phase(time, period: 2.6, delay: node.delay)
            if p < 0.18 {
                let f = Bezier.spring(p / 0.18)
                frame.transform = CGAffineTransform(translationX: 0, y: -40 * (1 - f))
                frame.opacity = min(1, max(0, f))
            } else if p > 0.82 {
                frame.opacity = 1 - min(1, max(0, Bezier.spring((p - 0.82) / 0.18)))
            }
        case .confetti:
            let f = swing(time, period: 2.4, delay: node.delay)
            frame.transform = CGAffineTransform(translationX: 0, y: 8 * f)
            frame.opacity = 1 - 0.4 * f
        }
        return frame
    }
}

/// A CSS cubic-bezier timing function.
struct Bezier {
    let x1, y1, x2, y2: Double

    static let easeInOut = Bezier(x1: 0.42, y1: 0, x2: 0.58, y2: 1)
    /// `--spring` in styles.css.
    static let spring = Bezier(x1: 0.34, y1: 1.56, x2: 0.64, y2: 1)

    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        func curve(_ t: Double, _ a: Double, _ b: Double) -> Double {
            let u = 1 - t
            return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
        }
        // Bisection: x is monotonic in t for valid timing functions.
        var low = 0.0, high = 1.0, t = x
        for _ in 0..<24 {
            let estimate = curve(t, x1, x2)
            if abs(estimate - x) < 0.0005 { break }
            if estimate < x { low = t } else { high = t }
            t = (low + high) / 2
        }
        return curve(t, y1, y2)
    }
}
