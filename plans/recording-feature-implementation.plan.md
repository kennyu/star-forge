<!-- e8d7cc47-2dfe-425a-9700-87ce5ca1cae8 7953d0e6-16f9-4bdf-87b9-ba9e00675afa -->
# Recording Feature Implementation Plan

## Overview
Implement a comprehensive recording system that allows users to record screen, webcam, or both (with PiP), with configurable audio sources (microphone and/or system audio). Recordings will be saved to disk and automatically added to the media library.

## Architecture

### 1. Recording Store (`src/stores/recording.ts`)
Create a Pinia store to manage recording state and settings:
- **Recording modes**: `'screen'`, `'webcam'`, `'screen-pip'`
- **Audio sources**: microphone, system audio, both, or none
- **Recording state**: idle, previewing, recording, processing, completed, error
- **Stream management**: preview and recording MediaStream objects
- **Duration tracking**: elapsed recording time
- **Recorded chunks**: blob data before finalizing

### 2. Recording Dialog Component (`src/components/RecordingDialog.vue`)
Similar to `ExportDialog.vue` pattern, create a full-featured recording panel:
- **Mode selector**: Three buttons for screen/webcam/screen+PiP modes
- **Audio controls**: Checkboxes for microphone and system audio selection
- **Preview area**: Live preview of what will be recorded (including PiP layout preview)
- **Source selector**: Dropdown to choose screen/window (when applicable)
- **Recording controls**: Start/Stop recording buttons with visual state indicators
- **Timer display**: Show elapsed recording time (MM:SS format)
- **Status messages**: Show current state and any errors

### 3. Electron Main Process IPC Handlers (`electron/main.ts`)
Add IPC handlers for:
- `recording:getSources` - Get available screens and windows using `desktopCapturer`
- `recording:getAudioDevices` - Get available microphone devices
- `recording:saveRecording` - Save blob data to file and return metadata
- `dialog:saveRecording` - Show save dialog for recordings (reuse export location)

### 4. Recording Implementation Strategy

#### Mode 1: Screen Only
- Use `desktopCapturer` API to get screen sources
- Create MediaStream from selected source
- Optionally mix microphone/system audio

#### Mode 2: Webcam Only
- Use `navigator.mediaDevices.getUserMedia({ video: true })`
- Optionally add microphone audio

#### Mode 3: Screen + Picture-in-Picture
- Get both screen (desktopCapturer) and webcam (getUserMedia) streams
- Use Canvas API to composite:
  - Draw screen feed as background
  - Draw webcam feed as small overlay (e.g., bottom-right corner, 20% size)
  - Capture canvas as MediaStream using `captureStream()`
- Mix audio tracks from both sources if needed

#### Audio Handling
- **Microphone**: Get from `getUserMedia({ audio: true })`
- **System audio**: Get from `desktopCapturer` with audio enabled
- Mix multiple audio tracks using Web Audio API `AudioContext` if both are selected

#### Recording Process
1. Setup streams based on mode and audio settings
2. Create `MediaRecorder` instance with appropriate codec (VP9 or H264)
3. Collect chunks in memory during recording
4. On stop, create Blob and send to main process
5. Save to disk (same directory as exports)
6. Extract metadata with FFprobe
7. Add to media library via `clipStore.addClip()`

### 5. UI Integration (`src/App.vue`)
- Add "Record" button next to "Export" button in the header
- Button opens `RecordingDialog`
- Show recording indicator (red dot + timer) in header during active recording
- Handle recording completion by adding to media library

## File Changes

### New Files
- `src/stores/recording.ts` - Recording state management
- `src/components/RecordingDialog.vue` - Recording UI

### Modified Files
- `electron/main.ts` - Add IPC handlers for recording operations
- `src/App.vue` - Add Record button and dialog integration
- `package.json` - May need additional dependencies (if any audio mixing libraries needed)

## Key Technical Considerations

1. **Browser Permissions**: Electron apps can use desktopCapturer without user permission prompts
2. **File Format**: Record as WebM (VP9) for efficiency, can convert with FFmpeg if needed
3. **Canvas Compositing**: For PiP mode, render at 30fps to balance quality and performance
4. **Memory Management**: Stream blob chunks efficiently, clear streams on stop
5. **Error Handling**: Handle camera/microphone access failures gracefully
6. **Cross-platform**: Test on Windows primarily (Mac/Linux if time permits)

## Testing Checklist
- [ ] Screen-only recording works
- [ ] Webcam-only recording works  
- [ ] Screen + PiP recording works with correct layout
- [ ] Microphone audio captures correctly
- [ ] System audio captures correctly (if supported)
- [ ] Both audio sources mix correctly
- [ ] Recordings save to disk
- [ ] Recordings appear in media library with correct metadata
- [ ] Preview shows accurate representation before recording
- [ ] Timer updates during recording
- [ ] Stop button ends recording properly
- [ ] Error states display helpful messages

### To-dos

- [x] Create recording.ts store with state management for recording mode, audio sources, streams, and recording state
- [x] Add IPC handlers in electron/main.ts for getSources, getAudioDevices, and saveRecording
- [x] Create RecordingDialog.vue component with mode selector, audio controls, preview area, and recording controls
- [x] Implement screen-only recording using desktopCapturer API with audio mixing
- [x] Implement webcam-only recording using getUserMedia API
- [x] Implement screen + webcam PiP recording using Canvas compositing
- [x] Add Record button to App.vue header and integrate RecordingDialog
- [x] Implement save recording to disk and automatic addition to media library
- [x] Test all recording modes (screen, webcam, PiP) and audio configurations