import ExpoModulesCore

public class SonanceAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SonanceAudio")

    Events("onPlaybackStateChanged")
      
    OnCreate {
        SonanceAudioEngine.shared.onStateChange = { [weak self] state in
            self?.sendEvent("onPlaybackStateChanged", state)
        }
    }

    Function("initializePlayer") {
        return "Player initialized successfully from Swift!"
    }
      
    Function("play") {
        SonanceAudioEngine.shared.play()
    }
      
    Function("pause") {
        SonanceAudioEngine.shared.pause()
    }
      
    Function("next") {
        SonanceAudioEngine.shared.next()
    }
      
    Function("previous") {
        SonanceAudioEngine.shared.previous()
    }
      
    Function("seek") { (seconds: Double) in
        SonanceAudioEngine.shared.seek(to: seconds)
    }
      
    Function("setShuffle") { (enabled: Bool) in
        SonanceAudioEngine.shared.setShuffle(enabled)
    }
      
    Function("setRepeatMode") { (mode: String) in
        SonanceAudioEngine.shared.setRepeatMode(mode)
    }
      
    Function("setEqualizerEnabled") { (enabled: Bool) in
        SonanceAudioEngine.shared.setEqualizerEnabled(enabled)
    }
      
    Function("setEqualizerBands") { (gains: [Double], preamp: Double) in
        let floatGains = gains.map { Float($0) }
        SonanceAudioEngine.shared.setEqualizerBands(gains: floatGains, preamp: Float(preamp))
    }
      
    Function("loadTrack") { (trackDict: [String: Any]) in
        guard let id = trackDict["id"] as? String,
              let title = trackDict["title"] as? String,
              let artist = trackDict["artist"] as? String,
              let filePath = trackDict["filePath"] as? String else { return }
        
        let duration = (trackDict["duration"] as? Double) ?? (Double(trackDict["duration"] as? String ?? "") ?? nil)
        let track = SonanceTrack(
            id: id,
            title: title,
            artist: artist,
            filePath: filePath,
            artworkUrl: trackDict["artworkUrl"] as? String,
            duration: duration
        )
        SonanceAudioEngine.shared.loadTrack(track: track)
    }
      
    Function("setQueue") { (tracksArray: [[String: Any]], startIndex: Int) in
        let tracks: [SonanceTrack] = tracksArray.compactMap { dict in
            guard let id = dict["id"] as? String,
                  let title = dict["title"] as? String,
                  let artist = dict["artist"] as? String,
                  let filePath = dict["filePath"] as? String else { return nil }
            let duration = (dict["duration"] as? Double) ?? (Double(dict["duration"] as? String ?? "") ?? nil)
            return SonanceTrack(
                id: id,
                title: title,
                artist: artist,
                filePath: filePath,
                artworkUrl: dict["artworkUrl"] as? String,
                duration: duration
            )
        }
        SonanceAudioEngine.shared.setQueue(tracks: tracks, startIndex: startIndex)
    }
      
    AsyncFunction("extractMetadata") { (filePath: String, promise: Promise) in
        let fileURL: URL
        if filePath.hasPrefix("http") {
            fileURL = URL(string: filePath)!
        } else if filePath.hasPrefix("file://") {
            fileURL = URL(string: filePath)!
        } else {
            fileURL = URL(fileURLWithPath: filePath)
        }
        
        let asset = AVURLAsset(url: fileURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        
        Task {
            do {
                var durationInSeconds: Double = 0
                if let duration = try? await asset.load(.duration) {
                    if duration.isNumeric && !duration.seconds.isNaN {
                        durationInSeconds = duration.seconds
                    }
                }
                
                var metadataDict: [String: Any] = [
                    "duration": durationInSeconds
                ]
                
                let metadata = try await asset.load(.commonMetadata)
                for item in metadata {
                    guard let key = item.commonKey?.rawValue else { continue }
                    
                    if key == AVMetadataKey.commonKeyTitle.rawValue, let title = try await item.load(.stringValue) {
                        metadataDict["title"] = title
                    } else if key == AVMetadataKey.commonKeyArtist.rawValue, let artist = try await item.load(.stringValue) {
                        metadataDict["artist"] = artist
                    } else if key == AVMetadataKey.commonKeyAlbumName.rawValue, let album = try await item.load(.stringValue) {
                        metadataDict["album"] = album
                    } else if key == AVMetadataKey.commonKeyArtwork.rawValue, let data = try await item.load(.dataValue) {
                        metadataDict["artworkBase64"] = data.base64EncodedString()
                    }
                }
                
                promise.resolve(metadataDict)
            } catch {
                promise.reject("METADATA_ERROR", "Failed to extract metadata: \(error.localizedDescription)")
            }
        }
    }
  }
}
