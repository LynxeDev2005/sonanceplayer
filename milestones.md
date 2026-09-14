# Sonance Project Milestones

This document tracks the high-level progress across the 12 development milestones for Sonance.

## Phase 1: Expo & UI Foundation
- [x] **Milestone 1 — Expo Foundation**
  - Initialize Expo project with TypeScript and Expo Router
  - Implement base navigation, theme, and responsive layout
  - Setup Crystal Glass foundation and initial reusable components
  - Create placeholder screens and verify in Expo Go

- [x] **Milestone 2 — UI System**
  - [x] Build `GlassCard`, `GlassButton`, `GlassPill`, `GlassTabBar`
  - [x] Create `TrackRow`, `AlbumCard`, `MiniPlayer`, and Player layout
  - [x] Implement animations and gesture interactions
  - [x] Verify on multiple iPhone screen sizes

## Phase 2: Native Integration & Audio
- [x] **Milestone 3 — Expo Development Build**
  - [x] Add `expo-dev-client` and native module structure
  - [x] Setup Expo Modules API and native React ↔ Swift bridge
  - [x] Configure and successfully launch the development build

- [x] **Milestone 4 — Swift Audio Engine**
  - [x] Implement audio loading, play, pause, resume, seek
  - [x] Add next, previous, queue, shuffle, repeat
  - [x] Connect React Native UI to the Swift engine

- [x] **Milestone 5 — Background Audio**
  - [x] Configure `AVAudioSession` and background capabilities
  - [x] Handle audio route changes, Bluetooth, and interruptions
  - [x] Verify playback while app is minimized or screen is locked

- [x] **Milestone 6 — Lock Screen / Control Center**
  - [x] Implement `Now Playing` metadata and artwork
  - [x] Setup remote commands (play, pause, next, previous)
  - [x] Connect Lock Screen, Control Center, and headphone controls

## Phase 3: Library & Data Management
- [ ] **Milestone 7 — Local Music Library**
  - Setup local database and storage directory
  - Implement metadata scanning and track indexing
  - Build Library UI with indexed tracks and artwork storage

- [ ] **Milestone 8 — Import System**
  - Implement iOS Files and iCloud Drive import
  - Add Google Drive import functionality
  - Detect duplicates and extract metadata/artwork during import

- [ ] **Milestone 9 — Playlists / Search**
  - Create playlists, queue, and playlist editing
  - Implement search and sorting
  - Add "Recently Played" and "Recently Added" views

## Phase 4: Polish & Release
- [ ] **Milestone 10 — Advanced Player**
  - Complete the Full Player with artwork aura and dynamic background
  - Build queue interface and 5-band equalizer
  - Add advanced gestures and sleep timer

- [ ] **Milestone 11 — Performance / Polish**
  - Optimize startup, memory usage, scrolling, and animations
  - Improve database queries and audio stability
  - Verify UI smoothness on older target hardware (e.g., iPhone 11)

- [ ] **Milestone 12 — Release Candidate**
  - Perform full TypeScript validation, linting, and UI testing
  - Conduct thorough testing (offline, lock screen, bluetooth, etc.)
  - Generate final iOS production build via EAS
