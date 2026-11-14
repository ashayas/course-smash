import Foundation
import JavaScriptCore

/// What city.js reads off a course to pick and draw its building.
struct ArtSubject: Hashable {
    var id: String
    var title: String?
    var prompt: String?
    var tags: [String] = []
    var track: String?
    var icon: Icon?
    var status: String?
    var modules = 0
    var passed = 0

    fileprivate var object: [String: Any] {
        var object: [String: Any] = ["id": id, "tags": tags, "modules": modules, "passed": passed]
        object["title"] = title ?? NSNull()
        object["prompt"] = prompt ?? NSNull()
        object["track"] = track ?? NSNull()
        object["status"] = status ?? NSNull()
        object["icon"] = icon.map { ["archetype": $0.archetype, "material": $0.material, "roof": $0.roof, "accent": $0.accent] } ?? NSNull()
        return object
    }
}

/// How much of a building is built and lit. Floors are modules, and lit floors are passed modules.
struct ArtProgress: Hashable {
    var floors: Int
    var lit: Int
    var building = false
    var ambient: Double = 0

    fileprivate var object: [String: Any] { ["floors": floors, "lit": lit, "building": building, "ambient": ambient] }
}

/// Runs the web app's public/city.js, so the app draws exactly the buildings the website does.
/// The file is bundled as it is. Only its `export` keywords are dropped, since this is a plain script context.
@MainActor
final class CityEngine {
    static let shared = CityEngine()

    private let city: JSValue
    private var cache: [CacheKey: SVGDocument] = [:]

    private struct CacheKey: Hashable {
        let method: String
        let subjects: [ArtSubject]
        var progress: ArtProgress?
    }
    private let empty = SVGDocument(viewBox: CGRect(x: 0, y: 0, width: 1, height: 1), nodes: [])

    private init() {
        let context = JSContext()!
        context.exceptionHandler = { _, error in
            print("city.js: \(error?.toString() ?? "unknown error")")
        }
        let source = Bundle.main.url(forResource: "city", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        let script = source.replacingOccurrences(of: #"(?m)^export\s+"#, with: "", options: .regularExpression)
        context.evaluateScript(script + """

        ;globalThis.City = {
          building: (course, progress) => buildingSvg(course, progress ?? progressOf(course)),
          city: (courses) => citySvg(courses),
          finished: (course) => finishedSvg(course),
          mark: () => markSvg(),
          stack: () => stackSvg(),
          spec: (course) => { const s = specFor(course); return { archetype: s.archetype, material: s.material, roof: s.roof, accent: s.accent }; },
        };
        """)
        city = context.objectForKeyedSubscript("City")
    }

    /// One building on its plaza. Without `progress`, city.js works it out from the course's modules.
    func building(_ subject: ArtSubject, progress: ArtProgress? = nil) -> SVGDocument {
        draw(CacheKey(method: "building", subjects: [subject], progress: progress), arguments: [subject.object, progress?.object ?? NSNull()])
    }

    /// The hero island: the learner's newest courses at the front, then a building site.
    func city(_ subjects: [ArtSubject]) -> SVGDocument {
        draw(CacheKey(method: "city", subjects: subjects), arguments: [subjects.map(\.object)])
    }

    /// The fully lit building under confetti.
    func finished(_ subject: ArtSubject) -> SVGDocument {
        draw(CacheKey(method: "finished", subjects: [subject]), arguments: [subject.object])
    }

    /// The logo mark.
    func mark() -> SVGDocument { draw(CacheKey(method: "mark", subjects: []), arguments: []) }

    /// The loader: floors dropping onto a tower.
    func stack() -> SVGDocument { draw(CacheKey(method: "stack", subjects: []), arguments: []) }

    /// The building a course has now: its saved icon, or the one city.js picks from its topic.
    func spec(_ subject: ArtSubject) -> Icon {
        let value = city.invokeMethod("spec", withArguments: [subject.object])
        func field(_ name: String) -> String { value?.objectForKeyedSubscript(name)?.toString() ?? "" }
        return Icon(archetype: field("archetype"), material: field("material"), roof: field("roof"), accent: field("accent"))
    }

    private func draw(_ key: CacheKey, arguments: [Any]) -> SVGDocument {
        if let cached = cache[key] { return cached }
        guard let markup = city.invokeMethod(key.method, withArguments: arguments)?.toString(), let document = SVGParser.parse(markup) else { return empty }
        if cache.count > 400 { cache.removeAll(keepingCapacity: true) }
        cache[key] = document
        return document
    }
}

extension CourseSummary {
    var art: ArtSubject { ArtSubject(id: id, title: title, prompt: prompt, icon: icon, status: status, modules: modules, passed: passed) }
}

extension CatalogCourse {
    var art: ArtSubject { ArtSubject(id: id, title: title, tags: tags, track: track, icon: icon) }
}

extension Stats.Course {
    var art: ArtSubject { ArtSubject(id: id, title: title, prompt: prompt, icon: icon, status: status, modules: modules, passed: passed) }
}

extension CourseDetail {
    /// Until the outline exists the course draws as a building site, as on the web.
    var art: ArtSubject {
        ArtSubject(id: id, title: title, prompt: prompt, icon: icon, status: modules.isEmpty ? "building" : status, modules: modules.count, passed: passed)
    }
}
