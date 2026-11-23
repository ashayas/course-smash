import SwiftUI

/// The four tabs in the bar at the bottom.
enum AppTab: String, CaseIterable, Identifiable {
    case today, city, library, you
    var id: String { rawValue }
    var title: String {
        switch self {
        case .today: return "Today"
        case .city: return "City"
        case .library: return "Library"
        case .you: return "You"
        }
    }
}

/// Screens pushed on top of a tab.
enum Route: Hashable {
    case course(String)
    case libraryCourse(String)
    case stats
}

@MainActor
@Observable
final class AppModel {
    let api: APIClient
    let session: SessionStore

    /// Today's recall, the streak and the recall session. Shared, so every tab shows the same streak.
    let today: TodayModel

    var tab: AppTab = .today
    var path: [Route] = []
    /// The track the library opens on, as `#/library?track=` does on the web.
    var libraryTrack = ""
    /// Set by "Choose courses" on Today: You scrolls to the courses in daily recall once it has loaded.
    var focusRecallCourses = false

    private var config: AppConfig?
    private var catalog: Catalog?

    init() {
        api = APIClient(baseURL: AppModel.baseURL)
        today = TodayModel(api: api)
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

    func show(_ tab: AppTab, track: String = "") {
        libraryTrack = track
        path = []
        self.tab = tab
    }

    func open(_ route: Route) {
        path.append(route)
    }

    func signOut() {
        session.signOut()
        path = []
        tab = .today
        catalog = nil
        today.reset()
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
