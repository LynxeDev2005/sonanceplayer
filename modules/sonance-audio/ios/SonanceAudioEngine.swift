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
    public let replayGainTrack: Float?
    public let replayGainAlbum: Float?
    public let replayGainTrackPeak: Float?
    public let replayGainAlbumPeak: Float?

    public init(
        id: String,
        title: String,
        artist: String,
        filePath: String,
        artworkUrl: String? = nil,
        duration: Double? = nil,
        replayGainTrack: Float? = nil,
        replayGainAlbum: Float? = nil,
        replayGainTrackPeak: Float? = nil,
        replayGainAlbumPeak: Float? = nil
    ) {
        self.id = id
        self.title = title
        self.artist = artist
        self.filePath = filePath
        self.artworkUrl = artworkUrl
        self.duration = duration
        self.replayGainTrack = replayGainTrack
        self.replayGainAlbum = replayGainAlbum
        self.replayGainTrackPeak = replayGainTrackPeak
        self.replayGainAlbumPeak = replayGainAlbumPeak
    }
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
    
    // Core Dual-Node Graph for Gapless & Equal-Power Crossfade Playback
    private let audioEngine = AVAudioEngine()
    private let playerNodeA = AVAudioPlayerNode()
    private let playerNodeB = AVAudioPlayerNode()
    private let subMixerNode = AVAudioMixerNode()
    private let equalizerNode = AVAudioUnitEQ(numberOfBands: 10)
    
    // Active Node Management
    private var isNodeAActive: Bool = true
    private var activePlayerNode: AVAudioPlayerNode { isNodeAActive ? playerNodeA : playerNodeB }
    private var standbyPlayerNode: AVAudioPlayerNode { isNodeAActive ? playerNodeB : playerNodeA }
    
    private var activeAudioFile: AVAudioFile?
    private var standbyAudioFile: AVAudioFile?
    private var standbyTrackIndex: Int = -1
    
    private var scheduledStartFrame: AVAudioFramePosition = 0
    private var engineProgressTimer: Timer?
    private var crossfadeTimer: Timer?
    private var usesAudioEngine = false
    private var isCrossfading = false
    
    // Volume / ReplayGain Scaling
    private var activeBaseVolume: Float = 1.0
    private var standbyBaseVolume: Float = 1.0
    
    // ReplayGain Settings
    public private(set) var replayGainMode: String = "off" // "off", "track", "album"
    public private(set) var replayGainPreamp: Float = 0.0 // dB (-6 to +6)
    public private(set) var replayGainPreventClipping: Bool = true
    
    // Gapless & Crossfade Settings
    public private(set) var gaplessEnabled: Bool = true
    public private(set) var crossfadeDuration: Double = 0.0 // 0 to 12 seconds
    
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
    
    // MARK: - Sandbox Container Path Self-Healing
    
    private func resolveFileURL(_ rawPath: String) -> URL {
        if rawPath.hasPrefix("http://") || rawPath.hasPrefix("https://") {
            return URL(string: rawPath)!
        }
        var cleanPath = rawPath
        if cleanPath.hasPrefix("file://") {
            cleanPath = String(cleanPath.dropFirst(7))
        }
        cleanPath = cleanPath.removingPercentEncoding ?? cleanPath
        
        if FileManager.default.fileExists(atPath: cleanPath) {
            return URL(fileURLWithPath: cleanPath)
        }
        
        // Sideload sandbox container migration resolver:
        // Remap stale container UUIDs to active sandbox directory
        let fileName = (cleanPath as NSString).lastPathComponent
        if let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            let inTracks = documentsURL.appendingPathComponent("tracks").appendingPathComponent(fileName)
            if FileManager.default.fileExists(atPath: inTracks.path) {
                return inTracks
            }
            let inDocs = documentsURL.appendingPathComponent(fileName)
            if FileManager.default.fileExists(atPath: inDocs.path) {
                return inDocs
            }
        }
        
        return URL(fileURLWithPath: cleanPath)
    }
    
    // MARK: - ReplayGain / Loudness Normalization
    
    public func setReplayGain(mode: String, preamp: Float, preventClipping: Bool) {
        self.replayGainMode = mode
        self.replayGainPreamp = max(-6.0, min(6.0, preamp))
        self.replayGainPreventClipping = preventClipping
        
        // Re-apply ReplayGain to current track
        if currentIndex >= 0 && currentIndex < queue.count {
            let track = queue[currentIndex]
            activeBaseVolume = calculateTrackVolume(for: track)
            if !isCrossfading {
                activePlayerNode.volume = activeBaseVolume
            }
        }
        broadcastState()
    }
    
    public func setGaplessEnabled(_ enabled: Bool) {
        self.gaplessEnabled = enabled
        broadcastState()
    }
    
    public func setCrossfadeDuration(_ duration: Double) {
        self.crossfadeDuration = max(0.0, min(12.0, duration))
        broadcastState()
    }
    
    private func calculateTrackVolume(for track: SonanceTrack) -> Float {
        var gainDB: Float = 0.0
        if replayGainMode == "track" {
            gainDB = track.replayGainTrack ?? 0.0
        } else if replayGainMode == "album" {
            gainDB = track.replayGainAlbum ?? (track.replayGainTrack ?? 0.0)
        } else {
            return 1.0
        }
        
        let totalGainDB = gainDB + replayGainPreamp
        var linearFactor = pow(10.0, totalGainDB / 20.0)
        
        if replayGainPreventClipping {
            let peak: Float
            if replayGainMode == "album" {
                peak = track.replayGainAlbumPeak ?? (track.replayGainTrackPeak ?? 1.0)
            } else {
                peak = track.replayGainTrackPeak ?? 1.0
            }
            if peak > 0 {
                let maxLinear = 1.0 / peak
                if linearFactor > maxLinear {
                    linearFactor = maxLinear
                }
            }
        }
        
        return max(0.0, min(2.0, linearFactor))
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
        } else if standbyAudioFile == nil {
            preloadNextTrack()
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
        preloadNextTrack()
        broadcastState()
    }
    
    private func cancelCrossfade() {
        crossfadeTimer?.invalidate()
        crossfadeTimer = nil
        isCrossfading = false
    }
    
    private func loadCurrentTrack() {
        guard currentIndex >= 0 && currentIndex < queue.count else { return }
        cancelCrossfade()
        
        let track = queue[currentIndex]
        let fileURL = resolveFileURL(track.filePath)
        
        stopAVPlayer()

        if fileURL.isFileURL, loadAudioEngineFile(fileURL, trackIndex: currentIndex) {
            preloadNextTrack()
            updateNowPlayingInfo()
            broadcastState()
            return
        }

        // Remote URL Fallback
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
                activePlayerNode.play()
            } catch {
                print("Failed to start audio engine: \(error)")
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
            activePlayerNode.pause()
            if isCrossfading {
                standbyPlayerNode.pause()
            }
        } else {
            player?.pause()
        }
        isPlaying = false
        updateNowPlayingInfo()
        broadcastState()
    }
    
    public func stop() {
        cancelCrossfade()
        if usesAudioEngine {
            activePlayerNode.stop()
            standbyPlayerNode.stop()
            activeAudioFile = nil
            standbyAudioFile = nil
            standbyTrackIndex = -1
        }
        stopAVPlayer()
        isPlaying = false
        currentIndex = -1
        queue = []
        updateNowPlayingInfo()
        broadcastState()
    }
    
    public func seek(to seconds: Double) {
        cancelCrossfade()
        if usesAudioEngine, let audioFile = activeAudioFile {
            let frame = AVAudioFramePosition(max(0, min(seconds * audioFile.processingFormat.sampleRate, Double(audioFile.length))))
            let shouldResume = isPlaying
            activePlayerNode.stop()
            scheduleAudioFile(from: frame, trackIndex: currentIndex)
            if shouldResume {
                activePlayerNode.play()
            }
            preloadNextTrack()
            updateNowPlayingInfo()
            broadcastState()
            return
        }
        let time = CMTime(seconds: seconds, preferredTimescale: 1000)
        player?.seek(to: time)
        updateNowPlayingInfo()
    }
    
    public func next() {
        cancelCrossfade()
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
        cancelCrossfade()
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
        preloadNextTrack()
        broadcastState()
    }
    
    public func setRepeatMode(_ mode: String) {
        self.repeatMode = RepeatMode(rawValue: mode) ?? .off
        preloadNextTrack()
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

    // MARK: - Audio Graph Setup

    private func setupAudioGraph() {
        audioEngine.attach(playerNodeA)
        audioEngine.attach(playerNodeB)
        audioEngine.attach(subMixerNode)
        audioEngine.attach(equalizerNode)

        audioEngine.connect(playerNodeA, to: subMixerNode, format: nil)
        audioEngine.connect(playerNodeB, to: subMixerNode, format: nil)
        audioEngine.connect(subMixerNode, to: equalizerNode, format: nil)
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
            activePlayerNode.stop()
            standbyPlayerNode.stop()
            
            let file = try AVAudioFile(forReading: url)
            activeAudioFile = file
            usesAudioEngine = true
            scheduledStartFrame = 0
            
            let track = queue[trackIndex]
            activeBaseVolume = calculateTrackVolume(for: track)
            activePlayerNode.volume = activeBaseVolume
            
            scheduleAudioFile(from: 0, trackIndex: trackIndex)
            
            if !audioEngine.isRunning {
                try audioEngine.start()
            }
            startEngineProgressTimer()
            return true
        } catch {
            print("Failed to load audio engine file: \(error)")
            activeAudioFile = nil
            usesAudioEngine = false
            return false
        }
    }

    private func scheduleAudioFile(from frame: AVAudioFramePosition, trackIndex: Int) {
        guard let audioFile = activeAudioFile else { return }
        let startFrame = max(0, min(frame, audioFile.length))
        let remainingFrames = audioFile.length - startFrame
        guard remainingFrames > 0 else { return }

        scheduledStartFrame = startFrame
        activePlayerNode.scheduleSegment(
            audioFile,
            startingFrame: startFrame,
            frameCount: AVAudioFrameCount(remainingFrames),
            at: nil
        ) { [weak self] in
            DispatchQueue.main.async {
                guard let self = self, self.usesAudioEngine, self.currentIndex == trackIndex else { return }
                self.handleActiveTrackFinished()
            }
        }
    }

    // MARK: - Pre-buffered Gapless & Equal-Power Crossfade Transition

    private func getNextTrackIndex() -> Int? {
        if shuffle && queue.count > 1 {
            var nextIdx = Int.random(in: 0..<queue.count)
            while nextIdx == currentIndex {
                nextIdx = Int.random(in: 0..<queue.count)
            }
            return nextIdx
        }
        if currentIndex < queue.count - 1 {
            return currentIndex + 1
        }
        if repeatMode == .queue && !queue.isEmpty {
            return 0
        }
        return nil
    }

    private func preloadNextTrack() {
        guard usesAudioEngine, let nextIndex = getNextTrackIndex() else {
            standbyPlayerNode.stop()
            standbyAudioFile = nil
            standbyTrackIndex = -1
            return
        }

        let nextTrack = queue[nextIndex]
        let nextURL = resolveFileURL(nextTrack.filePath)
        guard nextURL.isFileURL else { return }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let file = try AVAudioFile(forReading: nextURL)
                DispatchQueue.main.async {
                    guard self.currentIndex != nextIndex else { return }
                    self.standbyAudioFile = file
                    self.standbyTrackIndex = nextIndex
                    self.standbyBaseVolume = self.calculateTrackVolume(for: nextTrack)
                    
                    self.standbyPlayerNode.stop()
                    self.standbyPlayerNode.volume = self.crossfadeDuration > 0 ? 0.0 : self.standbyBaseVolume
                    
                    self.standbyPlayerNode.scheduleSegment(
                        file,
                        startingFrame: 0,
                        frameCount: AVAudioFrameCount(file.length),
                        at: nil
                    ) { [weak self] in
                        DispatchQueue.main.async {
                            guard let self = self, self.currentIndex == nextIndex else { return }
                            self.handleActiveTrackFinished()
                        }
                    }
                    self.standbyPlayerNode.prepare(withFrameCount: AVAudioFrameCount(min(file.length, 44100 * 2)))
                }
            } catch {
                print("Preload next track failed: \(error)")
            }
        }
    }

    private func triggerEqualPowerCrossfade() {
        guard !isCrossfading, crossfadeDuration > 0, let _ = standbyAudioFile, standbyTrackIndex >= 0 else { return }
        
        isCrossfading = true
        let targetIndex = standbyTrackIndex
        let targetFile = standbyAudioFile
        let targetBaseGain = standbyBaseVolume
        
        standbyPlayerNode.volume = 0.0
        if isPlaying {
            standbyPlayerNode.play()
        }
        
        let totalSteps = max(1, Int(crossfadeDuration * 40)) // 40 updates/sec
        var currentStep = 0
        let stepInterval = crossfadeDuration / Double(totalSteps)
        
        crossfadeTimer?.invalidate()
        crossfadeTimer = Timer.scheduledTimer(withTimeInterval: stepInterval, repeats: true) { [weak self] timer in
            guard let self = self, self.isCrossfading else {
                timer.invalidate()
                return
            }
            
            currentStep += 1
            let progress = min(1.0, Double(currentStep) / Double(totalSteps))
            
            // Equal-Power Crossfade Curves
            // Outgoing: cos(p * π / 2)
            // Incoming: sin(p * π / 2)
            let outGain = Float(cos(progress * Double.pi / 2.0)) * self.activeBaseVolume
            let inGain = Float(sin(progress * Double.pi / 2.0)) * targetBaseGain
            
            self.activePlayerNode.volume = max(0.0, outGain)
            self.standbyPlayerNode.volume = max(0.0, inGain)
            
            if progress >= 1.0 {
                timer.invalidate()
                self.crossfadeTimer = nil
                self.completeCrossfadeSwap(targetIndex: targetIndex, targetFile: targetFile, targetBaseGain: targetBaseGain)
            }
        }
    }

    private func completeCrossfadeSwap(targetIndex: Int, targetFile: AVAudioFile?, targetBaseGain: Float) {
        activePlayerNode.stop()
        
        // Swap active player node
        isNodeAActive.toggle()
        activeAudioFile = targetFile
        currentIndex = targetIndex
        activeBaseVolume = targetBaseGain
        activePlayerNode.volume = activeBaseVolume
        scheduledStartFrame = 0
        
        standbyAudioFile = nil
        standbyTrackIndex = -1
        isCrossfading = false
        
        updateNowPlayingInfo()
        broadcastState()
        preloadNextTrack()
    }

    private func handleActiveTrackFinished() {
        if isCrossfading { return }
        
        if repeatMode == .track {
            seek(to: 0)
            play()
            return
        }
        
        // True Gapless Transition via Pre-buffered Standby Node
        if gaplessEnabled, let standbyFile = standbyAudioFile, standbyTrackIndex >= 0 {
            standbyPlayerNode.volume = standbyBaseVolume
            if isPlaying {
                standbyPlayerNode.play()
            }
            
            activePlayerNode.stop()
            isNodeAActive.toggle()
            activeAudioFile = standbyFile
            currentIndex = standbyTrackIndex
            activeBaseVolume = standbyBaseVolume
            scheduledStartFrame = 0
            
            standbyAudioFile = nil
            standbyTrackIndex = -1
            
            updateNowPlayingInfo()
            broadcastState()
            preloadNextTrack()
            return
        }
        
        next()
    }

    private func engineCurrentTime() -> Double {
        guard usesAudioEngine, let audioFile = activeAudioFile else { return 0 }
        guard let nodeTime = activePlayerNode.lastRenderTime,
              let playerTime = activePlayerNode.playerTime(forNodeTime: nodeTime) else {
            return Double(scheduledStartFrame) / audioFile.processingFormat.sampleRate
        }
        let frame = min(audioFile.length, scheduledStartFrame + playerTime.sampleTime)
        return Double(frame) / audioFile.processingFormat.sampleRate
    }

    private func engineDuration() -> Double {
        guard let audioFile = activeAudioFile else { return 0 }
        return Double(audioFile.length) / audioFile.processingFormat.sampleRate
    }

    private func startEngineProgressTimer() {
        engineProgressTimer?.invalidate()
        engineProgressTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self = self, self.usesAudioEngine else { return }
            
            // Check if crossfade should start
            if self.crossfadeDuration > 0 && !self.isCrossfading && self.isPlaying && self.standbyAudioFile != nil {
                let remaining = self.engineDuration() - self.engineCurrentTime()
                if remaining <= self.crossfadeDuration && remaining > 0 {
                    self.triggerEqualPowerCrossfade()
                }
            }
            
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
            pause()
        } else if type == .ended {
            guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else { return }
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
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
            ],
            "replayGain": [
                "mode": replayGainMode,
                "preamp": replayGainPreamp,
                "preventClipping": replayGainPreventClipping
            ],
            "gaplessEnabled": gaplessEnabled,
            "crossfadeDuration": crossfadeDuration
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

