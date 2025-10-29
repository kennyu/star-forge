## Star-Forge — Simplified Technical Overview

### Goal

Build a **desktop video editor** that allows users to record, import, trim, arrange, and export videos in a lightweight, performant Electron + Vue application.

### Tech Stack

| Layer             | Technology                                   | Purpose                                                           |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Desktop Framework | **Electron v32**                             | Main process, file system access, recording via `desktopCapturer` |
| Frontend          | **Vue 3 + Vite + TypeScript**                | Reactive UI and timeline editor                                   |
| Media Processing  | **fluent-ffmpeg + ffmpeg-static**            | Video trim, concat, and export                                    |
| State             | **Pinia (reactive store)**                   | Manage clips, timeline state, and playhead                        |
| Playback          | **HTML5 video element / Video.js**           | Preview and scrub                                                 |
| Recording         | **navigator.mediaDevices.getDisplayMedia()** | Screen + audio capture                                            |

---

### Development Phases

#### 1. MVP (First 24 Hours)

Deliverables:

* Launchable **Electron app** (no dev-server dependency)
* Import MP4/MOV files via file picker or drag-drop
* Timeline view listing clips
* Basic preview player
* Trim (start/end points) for a single clip
* Export to MP4 via FFmpeg
* Packaged app (`.dmg` / `.exe`)

Purpose: prove working media I/O and rendering loop (import → display → trim → export).

---

#### 2. Core Features (Full Submission)

* **Recording**

  * Screen recording (Electron `desktopCapturer`)
  * Webcam overlay (PiP via getUserMedia)
  * Audio capture (microphone)
  * Save recordings directly to timeline
* **Import & Media Library**

  * Multi-file import (MP4, MOV, WebM)
  * Metadata (duration, resolution)
  * Thumbnail preview
* **Timeline Editor**

  * Drag-drop arrangement
  * Trim and split clips
  * Delete and re-order
  * Optional multi-track support
* **Preview & Playback**

  * Real-time preview (30 fps target)
  * Scrubbing and audio sync
  * Play/pause controls
* **Export**

  * Concatenate clips and render MP4 (720p / 1080p / source)
  * Show progress bar
  * Save to local filesystem

---

#### 3. Stretch Goals (Optional)

* Text overlays and filters
* Transitions (fade, slide)
* Audio controls (fade in/out)
* Export presets (YouTube, TikTok)
* Undo/redo and auto-save

---

#### 4. Performance Targets

* Smooth timeline with 10 + clips
* Preview ≥ 30 fps
* Launch < 5 s
* Export without crash or memory leak

---

#### 5. Submission Package

* GitHub repo with setup instructions
* Demo video (3 – 5 min)
* Built app download or build steps
* README explaining architecture and usage

---

### Simplified Summary

> Star-Forge is a **3-day sprint** to build a functional **desktop video editor** using Electron + Vue + FFmpeg.
> Focus on the **core loop**: **Record → Import → Arrange → Export.**
> Keep it stable, fast, and easy to package.
