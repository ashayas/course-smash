import SwiftUI

/// The three places in the header, matching the web app's nav.
enum AppSection: String, CaseIterable, Identifiable {
    case courses, library, stats
    var id: String { rawValue }
    var title: String {
        switch self {
        case .courses: return "Courses"
        case .library: return "Library"
        case .stats: return "Stats"
        }
    }
}

/// Screens pushed on top of a section.
enum Route: Hashable {
    case course(String)
    case libraryCourse(String)
}

@MainActor
@Observable
final class AppModel {
    let api: APIClient
    let session: SessionStore

    var section: AppSection = .courses
    var path: [Route] = []
    /// The track the library opens on, as `#/library?track=` does on the web.
    var libraryTrack = ""

    private var config: AppConfig?
    private var catalog: Catalog?

    init() {
        api = APIClient(baseURL: AppModel.baseURL)
        session = SessionStore(storage: KeychainSessionStorage(), service: WorkerAuthService(api: api))
        api.token = { [weak self] in self?.session.token }
        api.onUnauthorized = { [weak self] in self?.signOut() }
    }

    /// The Worker to talk to. Debug builds can point at a local `wrangler dev` with CS_API_BASE_URL.
    private static var baseURL: URL {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["CS_API_BASE_URL"], let url = URL(string: override) { return url }
        #endif
        let configured = Bundle.main.object(forInfoDictionaryKey: "CSAPIBaseURL") as? String
        return URL(string: configured ?? "") ?? URL(string: "https://coursesmash.app")!
    }

    func show(_ section: AppSection, track: String = "") {
        libraryTrack = track
        path = []
        self.section = section
    }

    func open(_ route: Route) {
        path.append(route)
    }

    func signOut() {
        session.signOut()
        path = []
        section = .courses
        catalog = nil
    }

    /// Starter ideas and the building picker's choices. Fetched once.
    func loadConfig() async throws -> AppConfig {
        if let config { return config }
        let loaded: AppConfig = try await api.get("/api/app")
        config = loaded
        return loaded
    }

    /// The library. Fetched once per sign-in, as the web app does per page load.
    func loadCatalog() async throws -> Catalog {
        if let catalog { return catalog }
        let loaded: Catalog = try await api.get("/api/catalog")
        catalog = loaded
        return loaded
    }
}
