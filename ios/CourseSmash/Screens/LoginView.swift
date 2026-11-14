import SwiftUI

/// The login gate: the same username and password as the web app. The password is never shown.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?
    @State private var working = false
    @FocusState private var focus: Field?

    private enum Field { case username, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                let city = CityEngine.shared.city([])
                SVGView(document: city, floats: true)
                    .aspectRatio(city.aspectRatio, contentMode: .fit)
                    .frame(maxWidth: 520)
                    .padding(.bottom, -28)
                    .accessibilityHidden(true)
                Text("Course Smash").type(.loginHero).accessibilityAddTraits(.isHeader)
                Text("Log in and tell me what you want to learn.").type(.lead).foregroundStyle(Theme.muted).multilineTextAlignment(.center)

                VStack(alignment: .leading, spacing: 10) {
                    if let error { ErrorText(message: error).accessibilityIdentifier("login-error") }
                    Text("Username").type(.smallMedium).padding(.top, 8)
                    TextField("", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focus, equals: .username)
                        .onSubmit { focus = .password }
                        .field()
                        .accessibilityLabel("Username")
                        .accessibilityIdentifier("username")
                    Text("Password").type(.smallMedium).padding(.top, 8)
                    SecureField("", text: $password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .focused($focus, equals: .password)
                        .onSubmit(logIn)
                        .field()
                        .accessibilityLabel("Password")
                        .accessibilityIdentifier("password")
                    Button(working ? "Logging in..." : "Log in", action: logIn)
                        .buttonStyle(PillButtonStyle(fullWidth: true))
                        .disabled(working)
                        .padding(.top, 16)
                        .accessibilityIdentifier("log-in")
                }
                .padding(28)
                .panel()

                SiteFooter()
            }
            .padding(.horizontal, 16)
            .padding(.top, 32)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.ink)
    }

    private func logIn() {
        guard !working else { return }
        let name = username.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !password.isEmpty else {
            focus = name.isEmpty ? .username : .password
            return
        }
        working = true
        error = nil
        Task {
            do {
                try await model.session.signIn(with: .password(username: name, password: password))
                password = ""
            } catch {
                self.error = message(of: error)
                working = false
            }
        }
    }
}

private extension View {
    /// A text field on ink, as on the web login form.
    func field() -> some View {
        type(.body)
            .foregroundStyle(Theme.paper)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .inset()
    }
}
