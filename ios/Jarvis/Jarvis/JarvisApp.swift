import SwiftUI
import AVFoundation

@main
struct JarvisApp: App {
    @StateObject private var engine = JarvisEngine()

    init() {
        // One shared audio session: record + playback through the loudspeaker.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default,
                                 options: [.defaultToSpeaker, .allowBluetooth])
        try? session.setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(engine)
                .preferredColorScheme(.dark)
        }
    }
}
