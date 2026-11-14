import Foundation

/// A failure the learner can read. The message comes from the Worker when it sent one.
struct APIError: LocalizedError, Equatable {
    let message: String
    var status: Int = 0
    var errorDescription: String? { message }

    static let generic = APIError(message: "Something went wrong. Try again.")
    static let offline = APIError(message: "Can't reach Course Smash. Check your connection and try again.")
}

/// Talks to the Worker's JSON endpoints under /api/.
final class APIClient: @unchecked Sendable {
    let baseURL: URL
    /// Set once at launch. Returns the current session token.
    var token: @MainActor () -> String? = { nil }
    /// Called when the Worker says the session is no longer good.
    var onUnauthorized: @MainActor () -> Void = {}

    private let session: URLSession
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    init(baseURL: URL) {
        self.baseURL = baseURL
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 240 // the agent can take a few minutes to plan a course
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await request("GET", path, query: query, body: nil, authorized: true)
    }

    func send<T: Decodable>(_ method: String, _ path: String, authorized: Bool = true) async throws -> T {
        try await request(method, path, query: [], body: nil, authorized: authorized)
    }

    func send<T: Decodable, B: Encodable>(_ method: String, _ path: String, body: B, authorized: Bool = true) async throws -> T {
        try await request(method, path, query: [], body: try JSONEncoder().encode(body), authorized: authorized)
    }

    private func request<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem], body: Data?, authorized: Bool) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorized, let token = await token() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch is URLError {
            throw APIError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401, authorized {
            await onUnauthorized()
            throw APIError(message: "Please log in.", status: 401)
        }
        // Advancing a course reports its outcome in the body even when the status is an error.
        let lenient = path.hasSuffix("/advance")
        guard (200..<300).contains(status) || lenient else {
            let message = (try? decoder.decode(ErrorBody.self, from: data))?.error
            throw APIError(message: message ?? APIError.generic.message, status: status)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            if lenient, let message = (try? decoder.decode(ErrorBody.self, from: data))?.error { throw APIError(message: message, status: status) }
            throw APIError.generic
        }
    }

    private struct ErrorBody: Decodable { let error: String? }
}
