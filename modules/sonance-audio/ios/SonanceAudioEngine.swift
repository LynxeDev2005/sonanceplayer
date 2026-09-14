import Foundation
import AVFoundation
import MediaPlayer

public struct SonanceTrack: Codable {
    public let id: String
    public let title: String
    public let artist: String
    public let filePath: String
    public let artworkUrl: String?
    public let duration: Double?
}

public enum RepeatMode: String {
    case off = "off"
    case track = "track"
    case queue = "queue"
}

public class SonanceAudioEngine {
    public static let shared = SonanceAudioEngine()
    
    private var player: AVPlayer?
    private var timeObserverToken: Any?
    // AVPlayer does not expose an audio-processing graph, so it cannot apply a
    // true equalizer. Local-library playback uses this graph instead.
    private let audioEngine = AVAudioEngine()
    private let audioPlayerNode = AVAudioPlayerNode()
    private let equalizerNode = AVAudioUnitEQ(numberOfBands: 10)
    private var audioFile: AVAudioFile?
    private var scheduledStartFrame: AVAudioFramePosition = 0
    private var engineProgressTimer: Timer?
    private var usesAudioEngine = false
    
    // State
    public private(set) var queue: [SonanceTrack] = []
    public private(set) var currentIndex: Int = -1
    public private(set) var isPlaying: Bool = false
    public private(set) var shuffle: Bool = false
    public private(set) var repeatMode: RepeatMode = .off
    
    // Equalizer State
    public private(set) var equalizerEnabled: Bool = false
    public private(set) var equalizerBands: [Float] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    public private(set) var equalizerPreamp: Float = 0
    private let eqFrequencies: [Float] = [32, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    
    // Callback for React Native
    public var onStateChange: (([String: Any]) -> Void)?
    
    private init() {
        setupAudioGraph()
        setupAudioSession()
        setupNotifications()
        setupRemoteCommandCenter()
    }
    
    // MARK: - Core Playback
    
    public func setQueue(tracks: [SonanceTrack], startIndex: Int = 0) {
        self.queue = tracks
        self.currentIndex = startIndex
        loadCurrentTrack()
        play()
    }
    
    public func loadTrack(track: SonanceTrack) {
        self.queue = [track]
        self.currentIndex = 0
        loadCurrentTrack()
        play()
    }

    public func addToQueue(track: SonanceTrack) {
        self.queue.append(track)
        if self.queue.count == 1 {
            self.currentIndex = 0
            loadCurrentTrack()
        }
        broadcastState()
    }

    public func playNext(track: SonanceTrack) {
        if currentIndex >= 0 && currentIndex < queue.count {
            queue.insert(track, at: currentIndex + 1)
        } else {
            queue.append(track)
            if queue.count == 1 {
                currentIndex = 0
                loadCurrentTrack()
            }
        }
        broadcastState()
    }
    
    private func loadCurrentTrack() {
        guard currentIndex >= 0 && currentIndex < queue.count else { return }
        let track = queue[currentIndex]
        
        let fileURL: URL
        if track.filePath.hasPrefix("http") {
            fileURL = URL(string: track.filePath)!
        } else if track.filePath.hasPrefix("file://") {
            if let parsed = URL(string: track.filePath) {
                fileURL = parsed
            } else {
                let cleanPath = track.filePath.replacingOccurrences(of: "file://", with: "")
                fileURL = URL(fileURLWithPath: cleanPath)
            }
        } else {
            fileURL = URL(fileURLWithPath: track.filePath)
        }
        
        stopAVPlayer()

        // AVAudioEngine gives us the same immediate, per-band DSP control that
        // VLC applies to its 10-band presets. It supports the app's local files.
        if fileURL.isFileURL, loadAudioEngineFile(fileURL, trackIndex: currentIndex) {
            updateNowPlayingInfo()
            broadcastState()
            return
        }

        // Keep remote URLs playable. AVPlayer has no public equalizer graph, so
        // EQ is intentionally limited to imported/local tracks.
        usesAudioEngine = false
        engineProgressTimer?.invalidate()
        engineProgressTimer = nil
        let asset = AVURLAsset(url: fileURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        let playerItem = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: playerItem)
        setupTimeObserver()
        
        updateNowPlayingInfo()
        broadcastState()
    }
    
    public func play() {
        if usesAudioEngine {
            do {
                if !audioEngine.isRunning {
                    try audioEngine.start()
                }
                audioPlayerNode.play()
            } catch {
                print("Failed to start equalizer audio engine: \(error)")
                return
            }
        } else {
            player?.play()
        }
        isPlaying = true
        updateNowPlayingInfo()
        broadcastState()
    }
    
    public func pause() {
        if usesAudioEngine {
            audioPlayerNode.pause()
        } else {
            player?.pause()
        }
        isPlaying = false
        updateNowPlayingInfo()
        broadcastState()
    }
    
    public func seek(to seconds: Double) {
        if usesAudioEngine, let audioFile = audioFile {
            let frame = AVAudioFramePosition(max(0, min(seconds * audioFile.processingFormat.sampleRate, Double(audioFile.length))))
            let shouldResume = isPlaying
            audioPlayerNode.stop()
            scheduleAudioFile(from: frame, trackIndex: currentIndex)
            if shouldResume {
                audioPlayerNode.play()
            }
            updateNowPlayingInfo()
            broadcastState()
            return
        }
        let time = CMTime(seconds: seconds, preferredTimescale: 1000)
        player?.seek(to: time)
        updateNowPlayingInfo()
    }
    
    public func next() {
        if currentIndex < queue.count - 1 {
            currentIndex += 1
            loadCurrentTrack()
            play()
        } else if repeatMode == .queue && !queue.isEmpty {
            currentIndex = 0
            loadCurrentTrack()
            play()
        } else {
            pause()
        }
    }
    
    public func previous() {
        let currentTime = usesAudioEngine ? engineCurrentTime() : (player?.currentTime().seconds ?? 0)
        if currentTime > 3.0 {
            seek(to: 0)
            play()
        } else if currentIndex > 0 {
            currentIndex -= 1
            loadCurrentTrack()
            play()
        } else {
            seek(to: 0)
            play()
        }
    }
    
    public func setShuffle(_ enabled: Bool) {
        self.shuffle = enabled
        broadcastState()
    }
    
    public func setRepeatMode(_ mode: String) {
        self.repeatMode = RepeatMode(rawValue: mode) ?? .off
        broadcastState()
    }
    
    // MARK: - Equalizer (VLC 10-Band Pro Engine)
    
    public func setEqualizerEnabled(_ enabled: Bool) {
        self.equalizerEnabled = enabled
        applyEqualizer()
        broadcastState()
    }
    
    public func setEqualizerBands(gains: [Float], preamp: Float) {
        self.equalizerBands = Array(gains.prefix(eqFrequencies.count))
            + Array(repeating: 0, count: max(0, eqFrequencies.count - gains.count))
        self.equalizerPreamp = max(-20, min(20, preamp))
        applyEqualizer()
        broadcastState()
    }

    // MARK: - Equalizer Audio Graph

    private func setupAudioGraph() {
        audioEngine.attach(audioPlayerNode)
        audioEngine.attach(equalizerNode)
        audioEngine.connect(audioPlayerNode, to: equalizerNode, format: nil)
        audioEngine.connect(equalizerNode, to: audioEngine.mainMixerNode, format: nil)

        for (index, band) in equalizerNode.bands.enumerated() {
            band.filterType = index == 0 ? .lowShelf : (index == eqFrequencies.count - 1 ? .highShelf : .parametric)
            band.frequency = eqFrequencies[index]
            band.bandwidth = 1.0
        }
        applyEqualizer()
    }

    private func applyEqualizer() {
        equalizerNode.globalGain = equalizerEnabled ? equalizerPreamp : 0
        for (index, band) in equalizerNode.bands.enumerated() {
            band.gain = equalizerEnabled ? equalizerBands[index] : 0
            band.bypass = !equalizerEnabled
        }
    }

    @discardableResult
    private func loadAudioEngineFile(_ url: URL, trackIndex: Int) -> Bool {
        do {
            audioPlayerNode.stop()
            audioEngine.stop()
            audioFile = try AVAudioFile(forReading: url)
            usesAudioEngine = true
            scheduledStartFrame = 0
            scheduleAudioFile(from: 0, trackIndex: trackIndex)
            try audioEngine.start()
            startEngineProgressTimer()
            return true
        } catch {
            print("Failed to load equalizer audio file: \(error)")
            audioFile = nil
            usesAudioEngine = false
            return false
        }
    }

    private func scheduleAudioFile(from frame: AVAudioFramePosition, trackIndex: Int) {
        guard let audioFile = audioFile else { return }
        let startFrame = max(0, min(frame, audioFile.length))
        let remainingFrames = audioFile.length - startFrame
        guard remainingFrames > 0 else { return }

        scheduledStartFrame = startFrame
        audioPlayerNode.scheduleSegment(
            audioFile,
            startingFrame: startFrame,
            frameCount: AVAudioFrameCount(remainingFrames),
            at: nil
        ) { [weak self] in
            DispatchQueue.main.async {
                guard let self, self.usesAudioEngine, self.currentIndex == trackIndex else { return }
                self.isPlaying = false
                if self.repeatMode == .track {
                    self.seek(to: 0)
                    self.play()
                } else {
                    self.next()
                }
            }
        }
    }

    private func engineCurrentTime() -> Double {
        guard usesAudioEngine, let audioFile = audioFile else { return 0 }
        guard let nodeTime = audioPlayerNode.lastRenderTime,
              let playerTime = audioPlayerNode.playerTime(forNodeTime: nodeTime) else {
            return Double(scheduledStartFrame) / audioFile.processingFormat.sampleRate
        }
        let frame = min(audioFile.length, scheduledStartFrame + playerTime.sampleTime)
        return Double(frame) / audioFile.processingFormat.sampleRate
    }

    private func engineDuration() -> Double {
        guard let audioFile = audioFile else { return 0 }
        return Double(audioFile.length) / audioFile.processingFormat.sampleRate
    }

    private func startEngineProgressTimer() {
        engineProgressTimer?.invalidate()
        engineProgressTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, self.usesAudioEngine else { return }
            self.updateNowPlayingInfo()
            self.broadcastState()
        }
    }

    private func stopAVPlayer() {
        if let player = player, let token = timeObserverToken {
            player.removeTimeObserver(token)
        }
        timeObserverToken = nil
        player?.pause()
        player = nil
    }
    
    // MARK: - Observers
    
    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: 1000)
        timeObserverToken = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.broadcastState()
        }
    }
    
    // MARK: - Lock Screen & Control Center
    
    private func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] event in
            self?.play()
            return .success
        }
        
        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] event in
            self?.pause()
            return .success
        }
        
        commandCenter.nextTrackCommand.isEnabled = true
        commandCenter.nextTrackCommand.addTarget { [weak self] event in
            self?.next()
            return .success
        }
        
        commandCenter.previousTrackCommand.isEnabled = true
        commandCenter.previousTrackCommand.addTarget { [weak self] event in
            self?.previous()
            return .success
        }
        
        commandCenter.changePlaybackPositionCommand.isEnabled = true
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            if let positionEvent = event as? MPChangePlaybackPositionCommandEvent {
                self?.seek(to: positionEvent.positionTime)
                return .success
            }
            return .commandFailed
        }
    }
    
    private func updateNowPlayingInfo() {
        guard currentIndex >= 0 && currentIndex < queue.count else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        
        let track = queue[currentIndex]
        var nowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artist
        ]
        
        if usesAudioEngine {
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = engineDuration()
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = engineCurrentTime()
            nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        } else if let player = player, let currentItem = player.currentItem {
            let dur = currentItem.duration.isNumeric && !currentItem.duration.seconds.isNaN && currentItem.duration.seconds > 0
                ? currentItem.duration.seconds
                : (track.duration ?? 0)
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = dur
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentItem.currentTime().seconds
            nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        }
        
        // Artwork placeholder (in a real app, we'd fetch the image data asynchronously)
        // if let image = UIImage(named: "placeholder") {
        //     nowPlayingInfo[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        // }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }
    
    private func setupAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
            try session.setActive(true)
        } catch {
            print("Failed to set audio session category: \(error)")
        }
    }
    
    private func setupNotifications() {
        NotificationCenter.default.addObserver(self, selector: #selector(itemDidFinishPlaying), name: .AVPlayerItemDidPlayToEndTime, object: nil)
        
        NotificationCenter.default.addObserver(self,
                                               selector: #selector(handleInterruption),
                                               name: AVAudioSession.interruptionNotification,
                                               object: nil)
        
        NotificationCenter.default.addObserver(self,
                                               selector: #selector(handleRouteChange),
                                               name: AVAudioSession.routeChangeNotification,
                                               object: nil)
    }
    
    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }
        
        if type == .began {
            // Interruption began, take appropriate actions (e.g., pause playback)
            pause()
        } else if type == .ended {
            guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else { return }
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
                // Interruption Ended - playback should resume
                play()
            }
        }
    }
    
    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }
        
        // Pause playback if headphones/bluetooth disconnected
        if reason == .oldDeviceUnavailable {
            pause()
        }
    }
    
    @objc private func itemDidFinishPlaying(notification: Notification) {
        guard let currentItem = player?.currentItem, 
              let objectItem = notification.object as? AVPlayerItem, 
              currentItem == objectItem else { return }
        
        if repeatMode == .track {
            seek(to: 0)
            play()
        } else {
            next()
        }
    }
    
    // MARK: - State Sync
    
    public func broadcastState() {
        guard let onStateChange = onStateChange else { return }
        
        var state: [String: Any] = [
            "isPlaying": isPlaying,
            "currentIndex": currentIndex,
            "shuffle": shuffle,
            "repeatMode": repeatMode.rawValue,
            "equalizer": [
                "enabled": equalizerEnabled,
                "bands": equalizerBands,
                "preamp": equalizerPreamp
            ]
        ]
        
        if usesAudioEngine {
            state["position"] = engineCurrentTime()
            state["duration"] = engineDuration()
        } else if let player = player, let currentItem = player.currentItem {
            state["position"] = currentItem.currentTime().seconds
            if currentItem.duration.isNumeric && !currentItem.duration.seconds.isNaN && currentItem.duration.seconds > 0 {
                state["duration"] = currentItem.duration.seconds
            } else if currentIndex >= 0 && currentIndex < queue.count, let trackDur = queue[currentIndex].duration, trackDur > 0 {
                state["duration"] = trackDur
            }
        } else if currentIndex >= 0 && currentIndex < queue.count, let trackDur = queue[currentIndex].duration, trackDur > 0 {
            state["duration"] = trackDur
        }
        
        if currentIndex >= 0 && currentIndex < queue.count {
            let currentTrack = queue[currentIndex]
            state["currentTrack"] = [
                "id": currentTrack.id,
                "title": currentTrack.title,
                "artist": currentTrack.artist,
                "filePath": currentTrack.filePath
            ]
        }
        
        onStateChange(state)
    }
}
