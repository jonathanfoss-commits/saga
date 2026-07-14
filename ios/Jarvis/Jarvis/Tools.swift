import Foundation
import UserNotifications
import UIKit
import EventKit

/// Client-side tools JARVIS can invoke (mirrors the web app, but native:
/// timers become real local notifications that fire even when the app is closed).
enum JarvisTools {

    static let definitions: JSONValue = .array([
        .object([
            "name": .string("get_datetime"),
            "description": .string("Get the user's current local date, time and timezone. Use whenever the answer depends on the current date or time."),
            "input_schema": .object(["type": .string("object"), "properties": .object([:])]),
        ]),
        .object([
            "name": .string("get_weather"),
            "description": .string("Get current weather and a 3-day forecast. If no location is given, uses the device's GPS position."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "location": .object(["type": .string("string"), "description": .string("City or place name. Omit to use the user's current position.")]),
                ]),
            ]),
        ]),
        .object([
            "name": .string("set_timer"),
            "description": .string("Set a countdown timer. Delivered as a local notification with sound, and announced aloud if the app is open."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "seconds": .object(["type": .string("number"), "description": .string("Duration in seconds")]),
                    "label": .object(["type": .string("string"), "description": .string("Short label, e.g. 'eggene' or 'pizza'")]),
                ]),
                "required": .array([.string("seconds")]),
            ]),
        ]),
        .object([
            "name": .string("remember"),
            "description": .string("Store a lasting fact about the user (name, preferences, family, important dates). Available in all future conversations."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "fact": .object(["type": .string("string"), "description": .string("The fact to remember, phrased as a short statement")]),
                ]),
                "required": .array([.string("fact")]),
            ]),
        ]),
        .object([
            "name": .string("open_url"),
            "description": .string("Open a website in the user's browser."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "url": .object(["type": .string("string"), "description": .string("Full https:// URL to open")]),
                ]),
                "required": .array([.string("url")]),
            ]),
        ]),
        .object([
            "name": .string("run_shortcut"),
            "description": .string("Run one of the user's Apple Shortcuts by its exact name. Shortcuts can control smart home devices (HomeKit), send messages, play music, trigger automations and much more. Ask the user for the exact shortcut name if unsure."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "name": .object(["type": .string("string"), "description": .string("Exact name of the shortcut in the Shortcuts app")]),
                    "input": .object(["type": .string("string"), "description": .string("Optional text passed to the shortcut as input")]),
                ]),
                "required": .array([.string("name")]),
            ]),
        ]),
        .object([
            "name": .string("add_calendar_event"),
            "description": .string("Add an event to the user's calendar (Apple Calendar). Use get_datetime first if you need today's date to compute the start time."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "title": .object(["type": .string("string"), "description": .string("Event title")]),
                    "start_iso": .object(["type": .string("string"), "description": .string("Start time as ISO 8601 with timezone offset, e.g. 2026-07-14T10:00:00+02:00")]),
                    "duration_minutes": .object(["type": .string("number"), "description": .string("Duration in minutes (default 60)")]),
                    "notes": .object(["type": .string("string"), "description": .string("Optional notes")]),
                ]),
                "required": .array([.string("title"), .string("start_iso")]),
            ]),
        ]),
        .object([
            "name": .string("add_reminder"),
            "description": .string("Add a reminder to the user's Reminders app, optionally with a due time."),
            "input_schema": .object([
                "type": .string("object"),
                "properties": .object([
                    "title": .object(["type": .string("string"), "description": .string("Reminder text")]),
                    "due_iso": .object(["type": .string("string"), "description": .string("Optional due time as ISO 8601 with timezone offset")]),
                ]),
                "required": .array([.string("title")]),
            ]),
        ]),
    ])

    static func statusText(for name: String) -> String {
        switch name {
        case "web_search": return "Søker på nettet …"
        case "get_weather": return "Sjekker været …"
        case "get_datetime": return "Sjekker klokka …"
        case "set_timer": return "Setter timer …"
        case "remember": return "Noterer …"
        case "open_url": return "Åpner nettside …"
        case "run_shortcut": return "Kjører snarvei …"
        case "add_calendar_event": return "Legger i kalenderen …"
        case "add_reminder": return "Oppretter påminnelse …"
        default: return "Arbeider …"
        }
    }

    @MainActor
    static func execute(name: String, input: JSONValue, engine: JarvisEngine) async -> (result: String, isError: Bool) {
        do {
            switch name {
            case "get_datetime":
                let now = Date()
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: engine.languageSetting)
                formatter.dateStyle = .full
                formatter.timeStyle = .short
                let payload: JSONValue = .object([
                    "local": .string(formatter.string(from: now)),
                    "iso": .string(ISO8601DateFormatter().string(from: now)),
                    "timezone": .string(TimeZone.current.identifier),
                ])
                return (String(data: payload.encoded(), encoding: .utf8) ?? "{}", false)

            case "get_weather":
                return try await weather(input: input, engine: engine)

            case "set_timer":
                let seconds = max(1, Int(input["seconds"]?.doubleValue ?? 0))
                let label = input["label"]?.stringValue ?? "timeren"
                let center = UNUserNotificationCenter.current()
                _ = try? await center.requestAuthorization(options: [.alert, .sound])
                let content = UNMutableNotificationContent()
                content.title = "J.A.R.V.I.S."
                content.body = "Sir, \(label) er ferdig."
                content.sound = .default
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(seconds), repeats: false)
                let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)
                try? await center.add(request)
                // Also announce in-app if it is still open when the timer fires.
                let announce = "Sir, \(label) er ferdig."
                Task { [weak engine] in
                    try? await Task.sleep(nanoseconds: UInt64(seconds) * 1_000_000_000)
                    guard let engine else { return }
                    engine.appendMessage(role: "jarvis", text: "⏰ " + announce)
                    engine.speakIfEnabled(announce)
                }
                return ("Timer '\(label)' satt: \(seconds) sekunder. Leveres som varsel med lyd selv om appen lukkes.", false)

            case "remember":
                guard let fact = input["fact"]?.stringValue, !fact.isEmpty else { return ("Mangler 'fact'.", true) }
                engine.addMemory(fact)
                return ("Lagret.", false)

            case "open_url":
                guard let urlString = input["url"]?.stringValue,
                      urlString.lowercased().hasPrefix("https://"),
                      let url = URL(string: urlString) else { return ("Avvist: kun gyldige https-adresser.", true) }
                UIApplication.shared.open(url)
                return ("Åpnet \(urlString)", false)

            case "run_shortcut":
                guard let shortcutName = input["name"]?.stringValue, !shortcutName.isEmpty else {
                    return ("Mangler snarvei-navn.", true)
                }
                var comps = URLComponents(string: "shortcuts://run-shortcut")!
                var items = [URLQueryItem(name: "name", value: shortcutName)]
                if let text = input["input"]?.stringValue, !text.isEmpty {
                    items.append(URLQueryItem(name: "input", value: "text"))
                    items.append(URLQueryItem(name: "text", value: text))
                }
                comps.queryItems = items
                guard let url = comps.url else { return ("Ugyldig snarvei-navn.", true) }
                UIApplication.shared.open(url)
                return ("Kjørte snarveien «\(shortcutName)» (forutsetter at den finnes i Snarveier-appen).", false)

            case "add_calendar_event":
                guard let title = input["title"]?.stringValue,
                      let startISO = input["start_iso"]?.stringValue,
                      let start = parseISO(startISO) else {
                    return ("Mangler eller ugyldig tittel/starttid (bruk ISO 8601 med tidssone).", true)
                }
                let eventStore = EKEventStore()
                let granted = (try? await eventStore.requestWriteOnlyAccessToEvents()) ?? false
                guard granted else { return ("Fikk ikke tilgang til kalenderen. Gi tillatelse i Innstillinger → Jarvis.", true) }
                let minutes = input["duration_minutes"]?.doubleValue ?? 60
                let event = EKEvent(eventStore: eventStore)
                event.title = title
                event.startDate = start
                event.endDate = start.addingTimeInterval(max(5, minutes) * 60)
                event.notes = input["notes"]?.stringValue
                event.calendar = eventStore.defaultCalendarForNewEvents
                try eventStore.save(event, span: .thisEvent)
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: engine.languageSetting)
                formatter.dateStyle = .medium
                formatter.timeStyle = .short
                return ("Lagt i kalenderen: «\(title)» \(formatter.string(from: start)).", false)

            case "add_reminder":
                guard let title = input["title"]?.stringValue, !title.isEmpty else { return ("Mangler tittel.", true) }
                let reminderStore = EKEventStore()
                let ok = (try? await reminderStore.requestFullAccessToReminders()) ?? false
                guard ok else { return ("Fikk ikke tilgang til Påminnelser. Gi tillatelse i Innstillinger → Jarvis.", true) }
                let reminder = EKReminder(eventStore: reminderStore)
                reminder.title = title
                reminder.calendar = reminderStore.defaultCalendarForNewReminders()
                if let dueISO = input["due_iso"]?.stringValue, let due = parseISO(dueISO) {
                    reminder.dueDateComponents = Calendar.current.dateComponents(
                        [.year, .month, .day, .hour, .minute], from: due)
                }
                try reminderStore.save(reminder, commit: true)
                return ("Påminnelse opprettet: «\(title)».", false)

            default:
                return ("Ukjent verktøy: \(name)", true)
            }
        } catch {
            return ("Verktøyfeil: \(error.localizedDescription)", true)
        }
    }

    private static func parseISO(_ text: String) -> Date? {
        let iso = ISO8601DateFormatter()
        if let d = iso.date(from: text) { return d }
        // Fallback: no timezone offset — interpret as local time
        let local = DateFormatter()
        local.locale = Locale(identifier: "en_US_POSIX")
        local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        local.timeZone = TimeZone.current
        return local.date(from: text)
    }

    // MARK: Weather via Open-Meteo (free, no API key)

    @MainActor
    private static func weather(input: JSONValue, engine: JarvisEngine) async throws -> (String, Bool) {
        var lat: Double
        var lon: Double
        var place: String

        if let location = input["location"]?.stringValue, !location.isEmpty {
            let langCode = engine.languageSetting.hasPrefix("nb") ? "nb" : "en"
            var comps = URLComponents(string: "https://geocoding-api.open-meteo.com/v1/search")!
            comps.queryItems = [
                URLQueryItem(name: "name", value: location),
                URLQueryItem(name: "count", value: "1"),
                URLQueryItem(name: "language", value: langCode),
            ]
            let (data, _) = try await URLSession.shared.data(from: comps.url!)
            guard let json = JSONValue.parse(data),
                  let first = json["results"]?.arrayValue?.first,
                  let la = first["latitude"]?.doubleValue,
                  let lo = first["longitude"]?.doubleValue else {
                return ("Fant ikke stedet \"\(location)\".", false)
            }
            lat = la; lon = lo
            place = (first["name"]?.stringValue ?? location)
                + (first["country"]?.stringValue.map { ", " + $0 } ?? "")
        } else {
            guard let loc = await LocationOnce().fetch() else {
                return ("Fikk ikke tilgang til posisjon. Be brukeren oppgi et stedsnavn.", false)
            }
            lat = loc.coordinate.latitude
            lon = loc.coordinate.longitude
            place = "brukerens posisjon"
        }

        var comps = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        comps.queryItems = [
            URLQueryItem(name: "latitude", value: String(lat)),
            URLQueryItem(name: "longitude", value: String(lon)),
            URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"),
            URLQueryItem(name: "daily", value: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "forecast_days", value: "3"),
            URLQueryItem(name: "wind_speed_unit", value: "ms"),
        ]
        let (data, _) = try await URLSession.shared.data(from: comps.url!)
        guard var json = JSONValue.parse(data) else { return ("Klarte ikke å tolke værdata.", true) }
        json["place"] = .string(place)
        json["note"] = .string("weather_code is WMO code; wind in m/s")
        return (String(data: json.encoded(), encoding: .utf8) ?? "{}", false)
    }
}
