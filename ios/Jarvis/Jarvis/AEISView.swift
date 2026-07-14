import SwiftUI
import WebKit

/// AEIS (det digitale styrerommet) vises som innebygd webview mot den publiserte
/// appen. Én kodebase for hele beslutningsmotoren; webview-lagringen er varig
/// (WKWebsiteDataStore.default) så hovedbok, roller og profil overlever mellom økter.
struct AEISView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("jarvis_app_url") private var appURL = "https://jonathanfoss-commits.github.io/saga/"

    var body: some View {
        NavigationStack {
            AEISWebView(url: URL(string: appURL.hasSuffix("/") ? appURL + "aeis/" : appURL + "/aeis/"))
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("A.E.I.S.")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Lukk") { dismiss() }
                    }
                }
        }
        .preferredColorScheme(.dark)
    }
}

struct AEISWebView: UIViewRepresentable {
    let url: URL?

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.024, green: 0.047, blue: 0.086, alpha: 1)
        webView.allowsBackForwardNavigationGestures = true
        if let url { webView.load(URLRequest(url: url)) }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
