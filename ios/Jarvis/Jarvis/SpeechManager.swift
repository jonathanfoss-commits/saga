import Foundation
import Speech
import AVFoundation

/// Native speech-to-text (with automatic end-of-utterance detection)
/// and text-to-speech.
final class SpeechManager: NSObject, ObservableObject {
    @Published var transcript = ""
    @Published var isListening = false

    /// Called with the final transcript when the user stops talking.
    var onFinal: ((String) -> Void)?

    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let synthesizer = AVSpeechSynthesizer()
    private var silenceWork: DispatchWorkItem?
    private var finished = true

    // MARK: Permissions

    func requestPermissions() {
        SFSpeechRecognizer.requestAuthorization { _ in }
        AVAudioSession.sharedInstance().requestRecordPermission { _ in }
    }

    // MARK: Speech-to-text

    func startListening(localeIdentifier: String) -> Bool {
        stopSpeaking()
        stopListening(sendFinal: false)

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)),
              recognizer.isAvailable else { return false }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        request = req

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        audioEngine.prepare()
        do { try audioEngine.start() } catch { return false }

        finished = false
        DispatchQueue.main.async {
            self.transcript = ""
            self.isListening = true
        }

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                DispatchQueue.main.async { self.transcript = text }
                self.scheduleSilenceStop()
                if result.isFinal { self.stopListening(sendFinal: true) }
            }
            if error != nil { self.stopListening(sendFinal: true) }
        }
        scheduleSilenceStop(seconds: 6) // give the user time to start talking
        return true
    }

    /// Ends the utterance ~1.5 s after the last recognized words.
    private func scheduleSilenceStop(seconds: Double = 1.5) {
        silenceWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.stopListening(sendFinal: true) }
        silenceWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    func stopListening(sendFinal: Bool) {
        if finished && !audioEngine.isRunning { return }
        finished = true
        silenceWork?.cancel()
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        DispatchQueue.main.async {
            self.isListening = false
            let text = self.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
            if sendFinal, !text.isEmpty {
                self.transcript = ""
                self.onFinal?(text)
            }
        }
    }

    // MARK: Text-to-speech

    func speak(_ text: String, voiceIdentifier: String, languageCode: String) {
        let clean = text
            .replacingOccurrences(of: #"https?://\S+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"[*_#`>]"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }

        let utterance = AVSpeechUtterance(string: clean)
        if !voiceIdentifier.isEmpty, let v = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
            utterance.voice = v
        } else {
            utterance.voice = AVSpeechSynthesisVoice(language: languageCode)
        }
        utterance.pitchMultiplier = 0.95
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance) // queues if already speaking
    }

    func stopSpeaking() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    var isSpeaking: Bool { synthesizer.isSpeaking }
}
