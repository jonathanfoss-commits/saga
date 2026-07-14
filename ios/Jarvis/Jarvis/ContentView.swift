import SwiftUI

struct ContentView: View {
    @EnvironmentObject var engine: JarvisEngine
    @State private var inputText = ""
    @State private var showSettings = false
    @State private var showAEIS = false

    private let bg = Color(red: 0.024, green: 0.047, blue: 0.086)
    private let cyan = Color(red: 0.216, green: 0.835, blue: 1.0)
    private let muted = Color(red: 0.427, green: 0.616, blue: 0.71)

    var body: some View {
        ZStack {
            bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Divider().background(cyan.opacity(0.2))
                messageList
                statusLine
                controls
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView().environmentObject(engine) }
        .fullScreenCover(isPresented: $showAEIS) { AEISView() }
        .onAppear {
            engine.speech.requestPermissions()
            if engine.apiKey.isEmpty {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { showSettings = true }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text("J.A.R.V.I.S.")
                    .font(.system(size: 18, weight: .semibold, design: .monospaced))
                    .kerning(6)
                    .foregroundColor(cyan)
                    .shadow(color: cyan.opacity(0.6), radius: 8)
                Text("JUST A RATHER VERY INTELLIGENT SYSTEM")
                    .font(.system(size: 8, design: .monospaced))
                    .kerning(2)
                    .foregroundColor(muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(Date.now, style: .time)
                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                    .foregroundColor(cyan)
                HStack(spacing: 6) {
                    Button {
                        showAEIS = true
                    } label: {
                        Text("🏛 AEIS")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(muted)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .overlay(RoundedRectangle(cornerRadius: 7).stroke(cyan.opacity(0.25)))
                    }
                    Button {
                        showSettings = true
                    } label: {
                        Text("⚙ OPPSETT")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(muted)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .overlay(RoundedRectangle(cornerRadius: 7).stroke(cyan.opacity(0.25)))
                    }
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(engine.messages) { message in
                        MessageBubble(message: message, cyan: cyan, muted: muted)
                            .id(message.id)
                    }
                }
                .padding(18)
            }
            .onChange(of: engine.messages) { _ in
                if let last = engine.messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private var statusLine: some View {
        Group {
            if engine.speech.isListening && !engine.speech.transcript.isEmpty {
                Text("«\(engine.speech.transcript)»")
            } else if engine.speech.isListening {
                Text("LYTTER … SNAKK NÅ")
            } else {
                Text(engine.status.uppercased())
            }
        }
        .font(.system(size: 11, design: .monospaced))
        .kerning(2)
        .lineLimit(1)
        .foregroundColor(cyan.opacity(0.9))
        .frame(height: 18)
        .padding(.bottom, 4)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            ReactorButton(
                isActive: engine.speech.isListening,
                isBusy: engine.isBusy,
                cyan: cyan
            ) {
                let haptic = UIImpactFeedbackGenerator(style: .medium)
                haptic.impactOccurred()
                if engine.speech.isListening {
                    engine.speech.stopListening(sendFinal: true)
                } else if !engine.isBusy {
                    if !engine.speech.startListening(localeIdentifier: engine.languageSetting) {
                        engine.appendMessage(role: "error", text: "Talegjenkjenning utilgjengelig. Sjekk tillatelser i Innstillinger → Jarvis.")
                    }
                }
            }

            TextField("…eller skriv til Jarvis", text: $inputText)
                .font(.system(size: 15, design: .monospaced))
                .foregroundColor(.white)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.05)))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(cyan.opacity(0.2)))
                .submitLabel(.send)
                .onSubmit(send)

            Button(action: send) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(cyan)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private func send() {
        let text = inputText
        inputText = ""
        engine.ask(text)
    }
}

// MARK: - Message bubble

struct MessageBubble: View {
    let message: ChatMessage
    let cyan: Color
    let muted: Color

    var body: some View {
        switch message.role {
        case "user":
            HStack {
                Spacer(minLength: 40)
                Text(message.text)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color(red: 0.06, green: 0.16, blue: 0.24)))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(cyan.opacity(0.3)))
            }
        case "jarvis":
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("J.A.R.V.I.S.")
                        .font(.system(size: 8, design: .monospaced))
                        .kerning(2)
                        .foregroundColor(cyan.opacity(0.7))
                    Text(message.text)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundColor(Color(red: 0.84, green: 0.95, blue: 1.0))
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.04)))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(cyan.opacity(0.18)))
                Spacer(minLength: 40)
            }
        case "error":
            Text(message.text)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Color(red: 1.0, green: 0.42, blue: 0.42))
                .padding(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.red.opacity(0.35)))
        case "tool":
            HStack {
                Text(message.text)
                    .font(.system(size: 11, design: .monospaced))
                    .kerning(1)
                    .foregroundColor(muted)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(style: StrokeStyle(lineWidth: 1, dash: [4])).foregroundColor(muted.opacity(0.5)))
                Spacer()
            }
        default: // hint
            Text(message.text)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(muted)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Arc reactor button

struct ReactorButton: View {
    let isActive: Bool
    let isBusy: Bool
    let cyan: Color
    let action: () -> Void

    @State private var pulse = false

    var body: some View {
        Button(action: action) {
            ZStack {
                // Radar rings while listening
                if isActive {
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .stroke(cyan.opacity(0.5), lineWidth: 1.5)
                            .frame(width: 60, height: 60)
                            .scaleEffect(pulse ? 2.0 : 1.0)
                            .opacity(pulse ? 0 : 0.7)
                            .animation(
                                .easeOut(duration: 1.8).repeatForever(autoreverses: false).delay(Double(i) * 0.6),
                                value: pulse
                            )
                    }
                }
                Circle()
                    .fill(RadialGradient(
                        colors: [Color.white, cyan, Color(red: 0.05, green: 0.17, blue: 0.27)],
                        center: .center, startRadius: 2, endRadius: 32))
                    .frame(width: 60, height: 60)
                    .overlay(Circle().stroke(cyan.opacity(0.7), lineWidth: 2))
                    .shadow(color: cyan.opacity(isActive || isBusy ? 0.9 : 0.45), radius: pulse && (isActive || isBusy) ? 22 : 10)
                    .scaleEffect(isBusy && pulse ? 1.06 : 1.0)
                    .animation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true), value: pulse)
            }
            .frame(width: 64, height: 64)
        }
        .onAppear { pulse = true }
    }
}
