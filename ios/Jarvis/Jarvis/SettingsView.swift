import SwiftUI
import AVFoundation

struct SettingsView: View {
    @EnvironmentObject var engine: JarvisEngine
    @Environment(\.dismiss) private var dismiss

    @State private var apiKey = Keychain.load("jarvis_api_key")
    @State private var mcpToken = Keychain.load("jarvis_mcp_token")
    @AppStorage("jarvis_mcp_name") private var mcpName = ""
    @AppStorage("jarvis_mcp_url") private var mcpURL = ""
    @AppStorage("jarvis_model") private var model = "claude-opus-4-8"
    @AppStorage("jarvis_lang") private var language = "nb-NO"
    @AppStorage("jarvis_voice") private var voice = ""
    @AppStorage("jarvis_speak") private var speakAloud = true
    @AppStorage("jarvis_search") private var webSearch = true
    @AppStorage("jarvis_owner_profile") private var ownerProfile = ""
    @AppStorage("jarvis_app_url") private var appURL = "https://jonathanfoss-commits.github.io/saga/"

    private var voices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .sorted { $0.language < $1.language }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Anthropic API-nøkkel") {
                    SecureField("sk-ant-...", text: $apiKey)
                        .font(.system(.body, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Lagres kryptert i iOS-nøkkelringen på denne enheten. Hent nøkkel på platform.claude.com → API keys.")
                        .font(.footnote).foregroundColor(.secondary)
                }

                Section("Hjerne") {
                    Picker("Claude-modell", selection: $model) {
                        Text("Opus 4.8 – smartest").tag("claude-opus-4-8")
                        Text("Sonnet 5 – raskere/billigere").tag("claude-sonnet-5")
                    }
                    Toggle("Websøk (Jarvis kan søke på nettet)", isOn: $webSearch)
                }

                Section("Tale") {
                    Picker("Språk (talegjenkjenning)", selection: $language) {
                        Text("Norsk (bokmål)").tag("nb-NO")
                        Text("English (US)").tag("en-US")
                        Text("English (UK)").tag("en-GB")
                    }
                    Toggle("Les svar høyt", isOn: $speakAloud)
                    Picker("Stemme", selection: $voice) {
                        Text("Automatisk").tag("")
                        ForEach(voices, id: \.identifier) { v in
                            Text("\(v.name) (\(v.language))").tag(v.identifier)
                        }
                    }
                    Text("Tips: «Daniel (en-GB)» gir klassisk Jarvis-følelse. Last ned flere stemmer i Innstillinger → Tilgjengelighet → Opplest innhold.")
                        .font(.footnote).foregroundColor(.secondary)
                }

                Section("Integrasjon (MCP) – la Jarvis styre andre tjenester") {
                    TextField("Navn (f.eks. homeassistant)", text: $mcpName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("https://…/mcp", text: $mcpURL)
                        .font(.system(.footnote, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Token (valgfri)", text: $mcpToken)
                        .textInputAutocapitalization(.never)
                    Text("Lim inn en MCP-server-URL, f.eks. Home Assistant sin MCP-server (styr lys og varme), GitHub (api.githubcopilot.com/mcp/ med PAT som token) eller Todoist. Kjøres på Anthropic sin serverside.")
                        .font(.footnote).foregroundColor(.secondary)
                }

                Section("Eierprofil") {
                    TextEditor(text: $ownerProfile)
                        .font(.system(.footnote, design: .monospaced))
                        .frame(minHeight: 140)
                        .autocorrectionDisabled()
                    Text("Lim inn eierprofil-dokumentet ditt (mål, portefølje, mandat, grenser). Jarvis bruker det som bakgrunnskunnskap i alle svar. Lagres kun lokalt på denne enheten.")
                        .font(.footnote).foregroundColor(.secondary)
                }

                Section("Jarvis' hukommelse om deg") {
                    if engine.memory.isEmpty {
                        Text("Ingen lagrede fakta enda. Si f.eks. «Jarvis, husk at …»")
                            .font(.footnote).foregroundColor(.secondary)
                    } else {
                        ForEach(engine.memory, id: \.self) { fact in
                            Text("• " + fact).font(.footnote)
                        }
                        Button("Glem alt", role: .destructive) { engine.clearMemory() }
                    }
                }

                Section("AEIS (styrerommet)") {
                    TextField("https://…", text: $appURL)
                        .font(.system(.footnote, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Text("URL-en til den publiserte Jarvis-appen. 🏛 AEIS-knappen åpner styrerommet herfra (…/aeis/).")
                        .font(.footnote).foregroundColor(.secondary)
                }

                Section {
                    Button("Tøm samtale", role: .destructive) {
                        engine.clearConversation()
                        dismiss()
                    }
                }
            }
            .navigationTitle("Oppsett")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Lagre") {
                        Keychain.save(apiKey.trimmingCharacters(in: .whitespacesAndNewlines), for: "jarvis_api_key")
                        Keychain.save(mcpToken.trimmingCharacters(in: .whitespacesAndNewlines), for: "jarvis_mcp_token")
                        dismiss()
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}
