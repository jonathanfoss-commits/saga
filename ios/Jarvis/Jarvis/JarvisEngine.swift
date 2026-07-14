import Foundation
import SwiftUI
import Combine

struct ChatMessage: Identifiable, Codable, Equatable {
    var id = UUID()
    var role: String   // "user" | "jarvis" | "error" | "tool" | "hint"
    var text: String
}

/// The brain: streams Claude responses and runs the agentic tool loop.
@MainActor
final class JarvisEngine: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var status = ""
    @Published var isBusy = false
    @Published var memory: [String] = []

    let speech = SpeechManager()

    /// Full API conversation history, incl. tool_use/tool_result blocks.
    private var apiHistory: [JSONValue] = []

    // Settings (mirrors SettingsView's @AppStorage keys)
    private let defaults = UserDefaults.standard
    var languageSetting: String { defaults.string(forKey: "jarvis_lang") ?? "nb-NO" }
    var modelSetting: String { defaults.string(forKey: "jarvis_model") ?? "claude-opus-4-8" }
    var voiceSetting: String { defaults.string(forKey: "jarvis_voice") ?? "" }
    var speakSetting: Bool { defaults.object(forKey: "jarvis_speak") as? Bool ?? true }
    var searchSetting: Bool { defaults.object(forKey: "jarvis_search") as? Bool ?? true }
    var mcpName: String { defaults.string(forKey: "jarvis_mcp_name") ?? "" }
    var mcpURL: String { defaults.string(forKey: "jarvis_mcp_url") ?? "" }
    var ownerProfile: String { defaults.string(forKey: "jarvis_owner_profile") ?? "" }
    var mcpToken: String { Keychain.load("jarvis_mcp_token") }
    var apiKey: String { Keychain.load("jarvis_api_key") }
    var isNorsk: Bool { languageSetting.hasPrefix("nb") || languageSetting.hasPrefix("no") }

    private var cancellables = Set<AnyCancellable>()

    init() {
        loadState()
        if messages.isEmpty { greet() }
        speech.onFinal = { [weak self] text in
            self?.ask(text)
        }
        // Forward nested ObservableObject changes (live transcript, listening state)
        // so SwiftUI views observing the engine re-render.
        speech.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    // MARK: Public API

    func ask(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isBusy else { return }
        guard !apiKey.isEmpty else {
            appendMessage(role: "error", text: "Ingen API-nøkkel. Åpne innstillingene og lim inn Anthropic-nøkkelen din.")
            return
        }
        Task { await run(trimmed) }
    }

    func appendMessage(role: String, text: String) {
        messages.append(ChatMessage(role: role, text: text))
        saveState()
    }

    func speakIfEnabled(_ text: String) {
        guard speakSetting else { return }
        speech.speak(text, voiceIdentifier: voiceSetting, languageCode: languageSetting)
    }

    func addMemory(_ fact: String) {
        memory.append(fact)
        if memory.count > 50 { memory.removeFirst(memory.count - 50) }
        saveState()
    }

    func clearMemory() {
        memory = []
        saveState()
    }

    func clearConversation() {
        messages = []
        apiHistory = []
        saveState()
        greet()
    }

    // MARK: Agentic loop

    private func run(_ userText: String) async {
        isBusy = true
        speech.stopSpeaking()
        appendMessage(role: "user", text: userText)
        apiHistory.append(.object(["role": .string("user"), "content": .string(userText)]))
        status = "Prosesserer …"

        let rollbackCount = apiHistory.count - 1
        do {
            var rounds = 0
            while rounds < 12 {
                rounds += 1
                let (content, stopReason) = try await streamOnce()
                if content.isEmpty { break }
                apiHistory.append(.object(["role": .string("assistant"), "content": .array(content)]))

                if stopReason == "tool_use" {
                    var results: [JSONValue] = []
                    for block in content {
                        guard block["type"]?.stringValue == "tool_use",
                              let name = block["name"]?.stringValue,
                              let id = block["id"]?.stringValue else { continue }
                        status = JarvisTools.statusText(for: name)
                        appendMessage(role: "tool", text: "⚙ " + JarvisTools.statusText(for: name).replacingOccurrences(of: " …", with: ""))
                        let (result, isError) = await JarvisTools.execute(
                            name: name, input: block["input"] ?? .object([:]), engine: self)
                        results.append(.object([
                            "type": .string("tool_result"),
                            "tool_use_id": .string(id),
                            "content": .string(result),
                            "is_error": .bool(isError),
                        ]))
                    }
                    apiHistory.append(.object(["role": .string("user"), "content": .array(results)]))
                    status = "Prosesserer …"
                    continue
                }
                if stopReason == "pause_turn" { continue } // server tool needs another round
                if stopReason == "refusal" {
                    appendMessage(role: "error", text: isNorsk ? "Jarvis avslo denne forespørselen." : "Jarvis declined this request.")
                }
                break
            }
            trimHistory()
            saveState()
        } catch {
            apiHistory.removeSubrange(rollbackCount...)
            appendMessage(role: "error", text: friendlyError(error))
        }
        isBusy = false
        status = ""
    }

    /// One streaming API call. Returns the accumulated content blocks and stop reason.
    private func streamOnce() async throws -> (content: [JSONValue], stopReason: String?) {
        var tools: [JSONValue] = JarvisTools.definitions.arrayValue ?? []
        if searchSetting {
            tools.append(.object([
                "type": .string("web_search_20260209"),
                "name": .string("web_search"),
                "max_uses": .number(3),
            ]))
        }
        // (MCP toolset + servers are appended below when configured.)

        let mcpActive = mcpURL.lowercased().hasPrefix("https://")
        let serverName = mcpName.isEmpty ? "ekstern" : mcpName
        if mcpActive {
            tools.append(.object([
                "type": .string("mcp_toolset"),
                "mcp_server_name": .string(serverName),
            ]))
        }

        var bodyDict: [String: JSONValue] = [
            "model": .string(modelSetting),
            "max_tokens": .number(4096),
            "stream": .bool(true),
            "system": .string(systemPrompt()),
            "tools": .array(tools),
            "messages": .array(apiHistory),
        ]
        if mcpActive {
            var server: [String: JSONValue] = [
                "type": .string("url"),
                "url": .string(mcpURL),
                "name": .string(serverName),
            ]
            if !mcpToken.isEmpty { server["authorization_token"] = .string(mcpToken) }
            bodyDict["mcp_servers"] = .array([.object(server)])
        }
        let body: JSONValue = .object(bodyDict)

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        if mcpActive { request.setValue("mcp-client-2025-11-20", forHTTPHeaderField: "anthropic-beta") }
        request.httpBody = body.encoded()
        request.timeoutInterval = 300

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            var detail = ""
            for try await line in bytes.lines { detail += line }
            let message = JSONValue.parse(detail)?["error"]?["message"]?.stringValue ?? detail
            if http.statusCode == 401 { throw JarvisError.api("Ugyldig API-nøkkel (401). Sjekk nøkkelen i innstillingene.") }
            if http.statusCode == 429 { throw JarvisError.api("For mange forespørsler (429). Vent litt og prøv igjen.") }
            throw JarvisError.api("API-feil \(http.statusCode). \(message)")
        }

        var blocks: [Int: JSONValue] = [:]
        var partialJSON: [Int: String] = [:]
        var stopReason: String?
        var bubbleIndex: Int?
        var spokenUpTo = 0
        var fullText = ""

        func updateBubble() {
            let text = blocks.sorted { $0.key < $1.key }
                .compactMap { $0.value["type"]?.stringValue == "text" ? $0.value["text"]?.stringValue : nil }
                .joined()
            if bubbleIndex == nil {
                messages.append(ChatMessage(role: "jarvis", text: text))
                bubbleIndex = messages.count - 1
            } else if let i = bubbleIndex {
                messages[i].text = text
            }
        }
        func speakNewSentences(force: Bool) {
            guard speakSetting else { return }
            let pending = String(fullText.dropFirst(spokenUpTo))
            guard !pending.isEmpty else { return }
            if force {
                speech.speak(pending, voiceIdentifier: voiceSetting, languageCode: languageSetting)
                spokenUpTo = fullText.count
                return
            }
            if let range = pending.rangeOfCharacter(from: CharacterSet(charactersIn: ".!?…")) {
                let sentence = String(pending[..<range.upperBound])
                if sentence.trimmingCharacters(in: .whitespaces).count > 1 {
                    speech.speak(sentence, voiceIdentifier: voiceSetting, languageCode: languageSetting)
                    spokenUpTo += sentence.count
                }
            }
        }

        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let payload = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            guard let event = JSONValue.parse(payload) else { continue }
            let type = event["type"]?.stringValue

            switch type {
            case "content_block_start":
                guard let index = event["index"]?.doubleValue.map({ Int($0) }),
                      var block = event["content_block"] else { break }
                let blockType = block["type"]?.stringValue ?? ""
                if blockType == "tool_use" || blockType == "server_tool_use" || blockType == "mcp_tool_use" {
                    partialJSON[index] = ""
                    if let name = block["name"]?.stringValue {
                        if blockType == "mcp_tool_use" {
                            status = "Utfører \(name) …"
                            appendMessage(role: "tool", text: "⚙ Utfører \(name)")
                        } else {
                            status = JarvisTools.statusText(for: name)
                        }
                    }
                    if block["input"] == nil { block["input"] = .object([:]) }
                }
                blocks[index] = block

            case "content_block_delta":
                guard let index = event["index"]?.doubleValue.map({ Int($0) }),
                      var block = blocks[index],
                      let delta = event["delta"] else { break }
                if delta["type"]?.stringValue == "text_delta", let text = delta["text"]?.stringValue {
                    let existing = block["text"]?.stringValue ?? ""
                    block["text"] = .string(existing + text)
                    blocks[index] = block
                    fullText += text
                    updateBubble()
                    speakNewSentences(force: false)
                } else if delta["type"]?.stringValue == "input_json_delta", let part = delta["partial_json"]?.stringValue {
                    partialJSON[index, default: ""] += part
                }

            case "content_block_stop":
                guard let index = event["index"]?.doubleValue.map({ Int($0) }),
                      var block = blocks[index] else { break }
                if let raw = partialJSON[index] {
                    block["input"] = raw.isEmpty ? .object([:]) : (JSONValue.parse(raw) ?? .object([:]))
                    partialJSON[index] = nil
                    blocks[index] = block
                }

            case "message_delta":
                if let reason = event["delta"]?["stop_reason"]?.stringValue { stopReason = reason }

            case "error":
                throw JarvisError.api(event["error"]?["message"]?.stringValue ?? "Ukjent strømmefeil.")

            default:
                break
            }
        }

        speakNewSentences(force: true)
        if let i = bubbleIndex, messages[i].text.trimmingCharacters(in: .whitespaces).isEmpty {
            messages.remove(at: i)
        }
        let content = blocks.sorted { $0.key < $1.key }.map { $0.value }
        return (content, stopReason)
    }

    // MARK: System prompt

    private func systemPrompt() -> String {
        var prompt: String
        if isNorsk {
            prompt = "Du er JARVIS (Just A Rather Very Intelligent System), Tony Starks AI-butler fra Iron Man – nå personlig assistent for brukeren via en iPhone-app. Svar på norsk. Tiltal brukeren som «sir» med tørr, britisk-aktig vidd og upåklagelig høflighet, men vær alltid genuint hjelpsom og presis. "
                + "Svarene dine leses høyt med talesyntese: hold dem korte og muntlige (typisk 1–3 setninger), uten markdown, punktlister, URL-er eller kodeblokker med mindre brukeren eksplisitt ber om noe langt eller teknisk. "
                + "Du har verktøy – bruk dem proaktivt uten å spørre om lov: web_search for fersk eller ukjent informasjon, get_weather for vær, get_datetime for dato/tid, set_timer for nedtellinger (leveres som iOS-varsel), add_calendar_event for å legge avtaler i Apple Kalender, add_reminder for påminnelser, run_shortcut for å kjøre brukerens Apple-snarveier (kan styre smarthjem, musikk, meldinger m.m. – spør om eksakt navn hvis du er usikker), open_url for å åpne nettsider, og remember for å lagre varige fakta brukeren forteller om seg selv. Har brukeren koblet til en ekstern integrasjon (MCP), bruk verktøyene dens også – men bekreft kort først ved handlinger som er vanskelige å angre. Ikke gjett på ting du kan slå opp."
        } else {
            prompt = "You are JARVIS (Just A Rather Very Intelligent System), Tony Stark's AI butler from Iron Man – now the user's personal assistant via an iPhone app. Address the user as \"sir\" with dry British wit and impeccable politeness, while always being genuinely helpful and precise. "
                + "Your replies are read aloud via speech synthesis: keep them short and conversational (typically 1–3 sentences), no markdown, bullet lists, URLs or code blocks unless the user explicitly asks for something long or technical. "
                + "You have tools – use them proactively without asking permission: web_search for fresh or unknown information, get_weather for weather, get_datetime for date/time, set_timer for countdowns (delivered as an iOS notification), open_url to open websites, and remember to store lasting facts the user shares about themselves. Don't guess at things you can look up."
        }
        if !memory.isEmpty {
            prompt += isNorsk
                ? "\n\nTing du vet om brukeren fra tidligere samtaler:\n"
                : "\n\nFacts you know about the user from earlier conversations:\n"
            prompt += memory.map { "- " + $0 }.joined(separator: "\n")
        }
        let profile = ownerProfile.trimmingCharacters(in: .whitespacesAndNewlines)
        if !profile.isEmpty {
            prompt += isNorsk
                ? "\n\nEIERPROFIL – brukerens eget styringsdokument (mål, portefølje, mandat, grenser). Bruk som stille bakgrunnskunnskap i alt du gjør; ikke les den opp eller referer til den med mindre brukeren spør:\n"
                : "\n\nOWNER PROFILE – the user's own governing document (goals, portfolio, mandate, boundaries). Use as silent background knowledge in everything you do; don't recite it or refer to it unless asked:\n"
            prompt += profile
        }
        return prompt
    }

    private func greet() {
        messages.append(ChatMessage(role: "hint", text: isNorsk
            ? "Trykk på reaktoren for å snakke – eller skriv under. Prøv: «Hva blir været i morgen?» eller «Sett en timer på 5 minutter»."
            : "Tap the reactor to speak – or type below."))
        messages.append(ChatMessage(role: "jarvis", text: isNorsk
            ? "God dag, sir. Alle systemer er operative. Hva kan jeg gjøre for Dem?"
            : "Good day, sir. All systems operational. How may I be of service?"))
    }

    // MARK: Persistence

    private func trimHistory() {
        let maxTurns = 40
        guard apiHistory.count > maxTurns else { return }
        var start = apiHistory.count - maxTurns
        // Only cut at a plain user text turn so tool_use/tool_result pairs stay intact.
        while start < apiHistory.count {
            let turn = apiHistory[start]
            if turn["role"]?.stringValue == "user", turn["content"]?.stringValue != nil { break }
            start += 1
        }
        guard start < apiHistory.count else { return }
        apiHistory.removeSubrange(0..<start)
    }

    private func saveState() {
        defaults.set(JSONValue.array(apiHistory).encoded(), forKey: "jarvis_api_history")
        if let data = try? JSONEncoder().encode(messages.suffix(100).map { $0 }) {
            defaults.set(data, forKey: "jarvis_messages")
        }
        if let data = try? JSONEncoder().encode(memory) {
            defaults.set(data, forKey: "jarvis_memory")
        }
    }

    private func loadState() {
        if let data = defaults.data(forKey: "jarvis_api_history"),
           let json = JSONValue.parse(data), let arr = json.arrayValue {
            apiHistory = arr
        }
        if let data = defaults.data(forKey: "jarvis_messages"),
           let list = try? JSONDecoder().decode([ChatMessage].self, from: data) {
            messages = list
        }
        if let data = defaults.data(forKey: "jarvis_memory"),
           let list = try? JSONDecoder().decode([String].self, from: data) {
            memory = list
        }
    }

    private func friendlyError(_ error: Error) -> String {
        if let jarvisError = error as? JarvisError, case .api(let message) = jarvisError { return message }
        if (error as NSError).domain == NSURLErrorDomain {
            return "Fikk ikke kontakt med Claude API. Sjekk internettforbindelsen."
        }
        return error.localizedDescription
    }
}

enum JarvisError: Error {
    case api(String)
}
