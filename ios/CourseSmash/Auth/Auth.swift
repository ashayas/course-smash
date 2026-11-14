import Foundation
import Security

/// A signed-in learner. The token goes to the Worker as `Authorization: Bearer <token>`.
struct Session: Codable, Equatable {
    let token: String
    let username: String
    let expiresAt: Date

    var isValid: Bool { expiresAt > Date() }
}

/// What a learner hands over to prove who they are. Password is the only kind today.
/// Sign in with Apple or Google would each add a case here and a matching branch in `AuthService`.
enum Credential {
    case password(username: String, password: String)
}

/// Turns a credential into a session. The Worker does the checking.
protocol AuthService {
    func signIn(with credential: Credential) async throws -> Session
}

/// Where the session is kept between launches.
protocol SessionStorage {
    func load() -> Session?
    func save(_ session: Session)
    func clear()
}

struct WorkerAuthService: AuthService {
    let api: APIClient

    func signIn(with credential: Credential) async throws -> Session {
        switch credential {
        case let .password(username, password):
            struct Body: Encodable { let username: String; let password: String }
            let response: LoginResponse = try await api.send("POST", "/api/login", body: Body(username: username, password: password), authorized: false)
            return Session(token: response.token, username: response.username, expiresAt: Date(timeIntervalSince1970: response.expiresAt))
        }
    }
}

/// Keeps the session in the keychain, on this device only.
struct KeychainSessionStorage: SessionStorage {
    private let service = Bundle.main.bundleIdentifier ?? "app.coursesmash.ios"
    private let account = "session"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    func load() -> Session? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    func save(_ session: Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    func clear() {
        SecItemDelete(query as CFDictionary)
    }
}

/// The signed-in state for the whole app.
@MainActor
@Observable
final class SessionStore {
    private(set) var session: Session?
    private let storage: SessionStorage
    private let service: AuthService

    init(storage: SessionStorage, service: AuthService) {
        self.storage = storage
        self.service = service
        if let saved = storage.load(), saved.isValid { session = saved } else { storage.clear() }
    }

    var token: String? { session?.isValid == true ? session?.token : nil }

    func signIn(with credential: Credential) async throws {
        let new = try await service.signIn(with: credential)
        storage.save(new)
        session = new
    }

    /// Sessions are signed, not stored on the server, so signing out is forgetting the token.
    func signOut() {
        storage.clear()
        session = nil
    }
}
