# JARVIS – native iPhone-app 📱⚡

En **ekte native iOS-app** (SwiftUI) av Jarvis — med alt PWA-en har, pluss det bare en native app kan:

| Funksjon | Native fordel |
|---|---|
| ⏲️ Timere | Leveres som **ekte iOS-varsler med lyd** – ringer selv om appen er lukket |
| 🔐 API-nøkkel | Lagres kryptert i **iOS-nøkkelringen** (ikke localStorage) |
| 🎙️ Tale | Native `SFSpeechRecognizer` med automatisk «ferdig snakket»-deteksjon – slipp å trykke stopp |
| 🔊 Stemmer | Alle iOS-stemmer, inkl. høykvalitets nedlastbare (Innstillinger → Tilgjengelighet → Opplest innhold) |
| 📳 Haptikk | Følbar respons når du trykker på reaktoren |
| 🌤️ Vær | `CoreLocation` GPS + Open-Meteo |
| 📅 Kalender & påminnelser | «Legg inn møte i morgen kl. 10» → rett i Apple Kalender/Påminnelser via EventKit — ingen konto, ingen sky |
| 🍎 Snarveier | `run_shortcut` kjører hvilken som helst Apple-snarvei på navn → styr HomeKit, meldinger, musikk, alt Snarveier kan |
| 🌐 Websøk | Claudes serverside websøk, som i PWA-en |
| 🔌 MCP | Valgfri direktekobling til f.eks. Home Assistant MCP (token i nøkkelringen) |
| 💾 Hukommelse + historikk | Overlever omstart, «husk at …» fungerer på tvers av økter |
| 👤 Eierprofil | Lim inn styringsdokumentet ditt under Oppsett → Eierprofil — Jarvis bruker det som bakgrunnskunnskap i alle svar. Lagres kun lokalt på enheten |
| 🏛 AEIS | Hele styrerommet innebygd (🏛-knappen) — beslutningspipeline, hovedbok, radar og backup i appen |

## Slik bygger og installerer du (krever Mac med Xcode)

1. **Klon repoet** på Mac-en (eller last ned som ZIP fra GitHub):
   ```bash
   git clone https://github.com/jonathanfoss-commits/saga.git
   ```
2. Åpne **`ios/Jarvis/Jarvis.xcodeproj`** i Xcode (gratis fra Mac App Store)
3. Klikk på prosjektet øverst i venstremenyen → fanen **Signing & Capabilities** → velg ditt **Team** (logg inn med Apple-ID-en din — gratis konto fungerer)
4. Koble iPhonen til Mac-en med kabel (eller samme Wi-Fi), velg den som kjøremål øverst
5. Trykk **▶ Run** — appen installeres på telefonen
6. Første gang: på iPhonen, gå til **Innstillinger → Generelt → VPN og enhetsadministrasjon** og godkjenn utviklersertifikatet ditt
7. Åpne JARVIS, lim inn API-nøkkelen i Oppsett, og si «God dag»

> **Merk:** Med gratis Apple-ID må appen re-installeres fra Xcode hvert 7. døgn.
> Med betalt Apple Developer-konto (999 kr/år) varer den i ett år, og du kan
> distribuere via TestFlight til familie og venner.

## Arkitektur

| Fil | Ansvar |
|---|---|
| `JarvisApp.swift` | App-inngang, lydøkt-oppsett |
| `ContentView.swift` | HUD-grensesnittet: header m/klokke, meldingsliste, arc reactor-knapp med radar-ringer |
| `SettingsView.swift` | Oppsett: nøkkel (Keychain), modell, språk, stemme, hukommelse, eierprofil |
| `JarvisEngine.swift` | Hjernen: streaming mot Claude API (`claude-opus-4-8`), agentisk verktøy-løkke (`tool_use`/`tool_result`/`pause_turn`), historikk-persistens |
| `SpeechManager.swift` | Tale inn (SFSpeech + AVAudioEngine, stillhetsdeteksjon) og tale ut (AVSpeechSynthesizer, setning-for-setning under streaming) |
| `Tools.swift` | Verktøyene: vær, timer (UNUserNotificationCenter), klokke, husk, åpne URL |
| `Support.swift` | `JSONValue` (Codable any-JSON for API-historikken), Keychain-wrapper, én-gangs GPS-henting |

Ingen tredjeparts-avhengigheter — kun Apple-rammeverk + Claude API.
