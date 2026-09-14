import ExpoModulesCore
import AVFoundation

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

    Function("stop") {
        SonanceAudioEngine.shared.stop()
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

    Function("setReplayGain") { (mode: String, preamp: Double, preventClipping: Bool) in
        SonanceAudioEngine.shared.setReplayGain(mode: mode, preamp: Float(preamp), preventClipping: preventClipping)
    }

    Function("setGaplessEnabled") { (enabled: Bool) in
        SonanceAudioEngine.shared.setGaplessEnabled(enabled)
    }

    Function("setCrossfadeDuration") { (duration: Double) in
        SonanceAudioEngine.shared.setCrossfadeDuration(duration)
    }
      
    Function("loadTrack") { (trackDict: [String: Any]) in
        guard let track = self.parseTrackDict(trackDict) else { return }
        SonanceAudioEngine.shared.loadTrack(track: track)
    }
      
    Function("setQueue") { (tracksArray: [[String: Any]], startIndex: Int) in
        let tracks: [SonanceTrack] = tracksArray.compactMap { self.parseTrackDict($0) }
        SonanceAudioEngine.shared.setQueue(tracks: tracks, startIndex: startIndex)
    }

    Function("addToQueue") { (trackDict: [String: Any]) in
        guard let track = self.parseTrackDict(trackDict) else { return }
        SonanceAudioEngine.shared.addToQueue(track: track)
    }

    Function("playNext") { (trackDict: [String: Any]) in
        guard let track = self.parseTrackDict(trackDict) else { return }
        SonanceAudioEngine.shared.playNext(track: track)
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
                
                // Common metadata
                let commonMeta = try await asset.load(.commonMetadata)
                for item in commonMeta {
                    guard let key = item.commonKey?.rawValue else { continue }
                    
                    if key == AVMetadataKey.commonKeyTitle.rawValue, let title = try? await item.load(.stringValue) {
                        metadataDict["title"] = title
                    } else if key == AVMetadataKey.commonKeyArtist.rawValue, let artist = try? await item.load(.stringValue) {
                        metadataDict["artist"] = artist
                    } else if key == AVMetadataKey.commonKeyAlbumName.rawValue, let album = try? await item.load(.stringValue) {
                        metadataDict["album"] = album
                    } else if key == AVMetadataKey.commonKeyArtwork.rawValue, let data = try? await item.load(.dataValue) {
                        metadataDict["artworkBase64"] = data.base64EncodedString()
                    }
                }
                
                // Format-specific metadata for ReplayGain and SoundCheck tags
                if let allMeta = try? await asset.load(.metadata) {
                    for item in allMeta {
                        let keyString: String = {
                            if let k = item.commonKey?.rawValue { return k }
                            if let k = item.key as? String { return k }
                            return item.identifier?.rawValue ?? ""
                        }()
                        
                        let lower = keyString.lowercased()
                        if lower.contains("replaygain_track_gain") {
                            if let valStr = try? await item.load(.stringValue), let val = self.parseGainString(valStr) {
                                metadataDict["replayGainTrack"] = val
                            }
                        } else if lower.contains("replaygain_album_gain") {
                            if let valStr = try? await item.load(.stringValue), let val = self.parseGainString(valStr) {
                                metadataDict["replayGainAlbum"] = val
                            }
                        } else if lower.contains("replaygain_track_peak") {
                            if let valStr = try? await item.load(.stringValue), let val = Double(valStr.trimmingCharacters(in: .whitespaces)) {
                                metadataDict["replayGainTrackPeak"] = val
                            }
                        } else if lower.contains("replaygain_album_peak") {
                            if let valStr = try? await item.load(.stringValue), let val = Double(valStr.trimmingCharacters(in: .whitespaces)) {
                                metadataDict["replayGainAlbumPeak"] = val
                            }
                        } else if lower.contains("itunnorm") {
                            if let valStr = try? await item.load(.stringValue), let gain = self.parseSoundCheck(valStr) {
                                if metadataDict["replayGainTrack"] == nil {
                                    metadataDict["replayGainTrack"] = gain
                                }
                            }
                        }
                    }
                }
                
                promise.resolve(metadataDict)
            } catch {
                promise.reject("METADATA_ERROR", "Failed to extract metadata: \(error.localizedDescription)")
            }
        }
    }
  }

  private func parseTrackDict(_ dict: [String: Any]) -> SonanceTrack? {
      guard let id = dict["id"] as? String,
            let title = dict["title"] as? String,
            let artist = dict["artist"] as? String,
            let filePath = dict["filePath"] as? String else { return nil }
      
      let duration = (dict["duration"] as? Double) ?? (Double(dict["duration"] as? String ?? "") ?? nil)
      let replayGainTrack = (dict["replayGainTrack"] as? Float) ?? (dict["replaygain_track_gain"] as? Float) ?? ((dict["replayGainTrack"] as? Double).map { Float($0) }) ?? ((dict["replaygain_track_gain"] as? Double).map { Float($0) })
      let replayGainAlbum = (dict["replayGainAlbum"] as? Float) ?? (dict["replaygain_album_gain"] as? Float) ?? ((dict["replayGainAlbum"] as? Double).map { Float($0) }) ?? ((dict["replaygain_album_gain"] as? Double).map { Float($0) })
      let replayGainTrackPeak = (dict["replayGainTrackPeak"] as? Float) ?? (dict["replaygain_track_peak"] as? Float) ?? ((dict["replayGainTrackPeak"] as? Double).map { Float($0) }) ?? ((dict["replaygain_track_peak"] as? Double).map { Float($0) })
      let replayGainAlbumPeak = (dict["replayGainAlbumPeak"] as? Float) ?? (dict["replaygain_album_peak"] as? Float) ?? ((dict["replayGainAlbumPeak"] as? Double).map { Float($0) }) ?? ((dict["replaygain_album_peak"] as? Double).map { Float($0) })

      return SonanceTrack(
          id: id,
          title: title,
          artist: artist,
          filePath: filePath,
          artworkUrl: dict["artworkUrl"] as? String,
          duration: duration,
          replayGainTrack: replayGainTrack,
          replayGainAlbum: replayGainAlbum,
          replayGainTrackPeak: replayGainTrackPeak,
          replayGainAlbumPeak: replayGainAlbumPeak
      )
  }

  private func parseGainString(_ str: String) -> Double? {
      let cleaned = str.replacingOccurrences(of: "dB", with: "", options: .caseInsensitive)
                       .trimmingCharacters(in: .whitespacesAndNewlines)
      return Double(cleaned)
  }

  private func parseSoundCheck(_ str: String) -> Double? {
      let parts = str.trimmingCharacters(in: .whitespacesAndNewlines)
                     .components(separatedBy: .whitespaces)
                     .filter { !$0.isEmpty }
      guard parts.count >= 2, let scVal = UInt32(parts[0], radix: 16), scVal > 0 else { return nil }
      return -10.0 * log10(Double(scVal) / 1000.0)
  }
}

