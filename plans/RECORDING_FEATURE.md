# Recording Feature Implementation Summary

## Overview
The recording feature has been successfully implemented in Star-Forge, allowing users to record their screen, webcam, or both simultaneously with picture-in-picture (PiP) overlay.

## Components Implemented

### 1. Recording Store (`src/stores/recording.ts`)
- **State Management**: Centralized state for recording operations
- **Recording Modes**: 
  - Screen only
  - Webcam only
  - Screen + webcam (picture-in-picture)
- **Audio Settings**: Configurable microphone and system audio
- **Recording States**: idle, previewing, recording, processing, completed, error
- **Stream Management**: Handles multiple media streams (screen, webcam, audio)
- **Timer**: Tracks and formats elapsed recording time

### 2. Recording Dialog (`src/components/RecordingDialog.vue`)
- **Mode Selection**: Three-button interface for selecting recording mode
- **Source Selection**: Visual thumbnail grid for choosing screen/window to record
- **Audio Controls**: Checkboxes for microphone and system audio
- **Live Preview**: Real-time preview of what will be recorded
- **Recording Controls**: 
  - Start Preview button
  - Start Recording button (red with icon)
  - Stop Recording button
- **Timer Display**: Shows elapsed time during recording (MM:SS format)
- **Error Handling**: Displays user-friendly error messages
- **Processing Feedback**: Shows loading state while saving

### 3. Electron IPC Handlers (`electron/main.ts`)
Added two new IPC handlers:

#### `recording:getSources`
- Uses Electron's `desktopCapturer` API
- Returns available screens and windows with thumbnails
- Data includes: id, name, thumbnail (base64 data URL)

#### `recording:saveRecording`
- Receives recorded video as Buffer
- Shows save dialog to user
- Writes video file to disk
- Extracts metadata using FFprobe
- Returns file path and metadata

### 4. UI Integration (`src/App.vue`)
- **Record Button**: Added to header toolbar next to Export button
- **Recording Indicator**: Shows in header during active recording
  - Red pulsing dot
  - "Recording" label
  - Live timer display
- **Dialog Management**: Opens RecordingDialog when button clicked

## Technical Implementation

### Screen Recording
Uses Electron's `desktopCapturer` with `getUserMedia`:
```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
    }
  }
})
```

### Webcam Recording
Standard WebRTC getUserMedia:
```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720 },
  audio: false
})
```

### Picture-in-Picture Mode (Optimized)
Uses HTML5 Canvas for real-time compositing with performance optimizations:
1. Capture both screen and webcam streams (webcam at lower resolution: 320x240)
2. Create canvas element matching screen resolution
3. Render screen feed as background
4. Render webcam feed as small overlay (15% width, bottom-right, 4:3 aspect ratio)
5. Use optimized canvas settings (low image smoothing, frame throttling)
6. Capture canvas as MediaStream at 30 FPS (throttled)
7. Use canvas stream for recording

**Performance Optimizations:**
- Webcam resolution reduced to 320x240 max (from 640x480)
- PiP size reduced from 20% to 15% of screen width
- Image smoothing quality set to 'low' for faster rendering
- Frame rate explicitly throttled to maintain 30 FPS
- Canvas context optimized with `willReadFrequently: false` and `desynchronized: true`
- Reduced console logging overhead
- Thinner border (2px instead of 3px)

### Audio Handling
- **Microphone**: Separate getUserMedia call for audio
- **System Audio**: From screen capture stream (when available)
- **Audio Mixing**: Combines tracks into single MediaStream

### Recording Process
1. Setup video stream (screen/webcam/composite)
2. Setup audio tracks if enabled
3. Combine into single MediaStream
4. Create MediaRecorder with WebM VP8 codec (2.5 Mbps bitrate)
5. Collect data chunks during recording
6. Track elapsed recording time for duration metadata
7. On stop, combine chunks into Blob
8. **Fix WebM duration metadata** using `fix-webm-duration` library
9. Convert to Buffer and send to main process
10. Save file and extract metadata with FFprobe
11. Add to media library automatically with validated duration

### File Format
- **Recording Format**: WebM (VP8 codec)
- **Output Format**: WebM (native, no conversion)
- **Video Codec**: VP8 (optimized for Chromium/Electron compatibility)
- **Audio Codec**: Opus
- **Bitrate**: 2.5 Mbps
- **Saved Location**: User's Videos folder (configurable via save dialog)

#### Why VP8 WebM?
- **Maximum compatibility**: VP8 is fully supported by Chromium/Electron
- **No conversion delay**: Files are saved instantly without FFmpeg processing
- **No pixel format issues**: VP8 uses compatible pixel formats
- **Native format**: No quality loss from re-encoding
- **FFmpeg compatible**: Works perfectly in timeline editing and exports
- **Good compression**: Efficient file sizes while maintaining quality

## Features

### Recording Modes
✅ Screen Only - Record selected screen or window
✅ Webcam Only - Record from webcam
✅ Screen + PiP - Screen with webcam overlay in corner

### Audio Options
✅ Microphone - Capture microphone input
✅ System Audio - Capture system/application audio
✅ Both - Mix microphone and system audio
✅ None - Video only recording

### User Experience
✅ Live preview before recording starts
✅ Visual recording indicator (red dot + timer)
✅ Real-time elapsed time display
✅ Screen source selection with thumbnails
✅ Automatic addition to media library
✅ Error handling with user-friendly messages
✅ Processing feedback while saving
✅ Success confirmation on completion

## Usage Flow

1. User clicks "Record" button in header
2. Recording dialog opens
3. User selects recording mode (Screen/Webcam/PiP)
4. User selects screen source (if applicable)
5. User configures audio settings
6. User clicks "Start Preview" to see what will be recorded
7. User clicks "Start Recording" (button turns red)
8. Recording indicator appears in header with timer
9. User clicks "Stop Recording" when done
10. App processes and saves the recording
11. File is automatically added to media library
12. Dialog closes and user can use the recording

## Integration with Existing Features

- **Media Library**: Recordings automatically appear as clips
- **Timeline**: Recordings can be dragged to timeline like imported clips
- **Video Player**: Recordings can be previewed
- **Export**: Recordings can be exported with other clips

## Performance Considerations

- Canvas compositing runs at 30 FPS for PiP mode
- MediaRecorder collects chunks every 1 second
- Streams are properly cleaned up on stop
- Animation frames are cancelled on cleanup
- Memory efficient blob handling

## Browser/Electron APIs Used

- `desktopCapturer` (Electron main process)
- `getUserMedia` (WebRTC)
- `MediaRecorder` (WebRTC)
- `MediaStream` (WebRTC)
- `Canvas` (HTML5)
- `AudioContext` (Web Audio API - implicit in stream mixing)
- IPC (Electron inter-process communication)

## Dependencies Added

- **`fix-webm-duration`** - Injects duration metadata into WebM container headers
  - Used to fix MediaRecorder's limitation of not writing duration
  - Critical for FFprobe compatibility and timeline functionality

## Files Modified

### New Files
- `src/stores/recording.ts` (247 lines)
- `src/components/RecordingDialog.vue` (645 lines)
- `RECORDING_FEATURE.md` (this file)

### Modified Files
- `electron/main.ts` (+137 lines)
  - Added desktopCapturer import
  - Added recording:getSources handler
  - Added recording:saveRecording handler with FFprobe metadata extraction
  - Enhanced FFprobe logging and duration fallback mechanisms
- `src/App.vue` (+20 lines)
  - Added RecordingDialog import
  - Added Record button
  - Added recording indicator
  - Added recording store
- `src/components/RecordingDialog.vue` (+10 lines)
  - Integrated fix-webm-duration library
  - Added duration metadata fixing before save
- `src/components/Timeline.vue` (+8 lines)
  - Added duration validation before adding clips
  - Protected grid rendering from invalid durations
- `src/components/MediaLibrary.vue` (+8 lines)
  - Enhanced formatDuration to handle invalid values
  - Added double-click to show in folder functionality
- `src/components/FileImport.vue` (cleanup)
  - Removed debug logging, kept error/warning logs
- `src/stores/clips.ts` (cleanup)
  - Removed debug logging
- `src/stores/timeline.ts` (+12 lines)
  - Added totalDuration validation to prevent Infinity
- `package.json` (+1 dependency)
  - Added fix-webm-duration package

## Testing Recommendations

1. **Screen Recording**: Test recording different screens and windows
2. **Webcam Recording**: Test with/without webcam connected
3. **PiP Mode**: Verify overlay positioning and compositing quality
4. **Audio**: Test all audio combinations
5. **Multiple Recordings**: Test creating multiple recordings in sequence
6. **File Saving**: Verify files save correctly and open in video players
7. **Media Library**: Confirm recordings appear with correct metadata and duration
8. **Timeline Integration**: Test adding recordings to timeline (should work without errors)
9. **Duration Display**: Verify duration shows correctly (not 0:00)
10. **Error Cases**: Test with no webcam, denied permissions, etc.
11. **Old Recordings**: Test importing old WebM files without duration metadata
12. **Double-click**: Test show in folder functionality in media library

## Duration Metadata Fix

### Problem
WebM files created by `MediaRecorder` don't include duration metadata in the container header. This caused:
- FFprobe unable to read duration (returned 0 or undefined)
- Media library showing `0:00` for all recordings
- Timeline crashes when trying to add recordings (Infinity errors)
- Unable to play or edit recorded videos

### Solution
Integrated `fix-webm-duration` library to inject proper duration metadata:

1. **During Recording**: Track elapsed time in recording store
2. **After Recording**: Use `fixWebmDuration(blob, durationMs)` to fix the WebM container
3. **Before Saving**: Fixed blob is converted to buffer and saved to disk
4. **Result**: FFprobe can now correctly read duration from saved files

### Implementation
```javascript
// In RecordingDialog.vue processRecording()
const recordingDurationMs = recordingStore.elapsedTime * 1000
const fixedBlob = await fixWebmDuration(originalBlob, recordingDurationMs, { logger: false })
```

### Validation & Error Handling
Added comprehensive validation throughout the app:

#### Timeline Validation (`Timeline.vue`)
- Prevents adding clips with duration ≤ 0, NaN, or Infinity
- Shows user-friendly error message
- Grid rendering capped at 1000 iterations to prevent RangeError

#### Duration Formatting (`MediaLibrary.vue`)
- Handles invalid values (Infinity, NaN, null, negative)
- Returns `'0:00'` for invalid durations instead of crashing

#### Store Validation (`timeline.ts`)
- `totalDuration` computed property validates each clip
- Skips clips with invalid durations
- Ensures final result is finite

#### FFprobe Enhancements (`electron/main.ts`)
- Comprehensive logging of raw and parsed data
- Multiple fallback methods for duration extraction
- Graceful handling when duration unavailable

## Known Limitations

1. System audio capture may not work on all platforms (OS-dependent)
2. PiP overlay position is fixed (bottom-right, 15% size, 4:3 aspect ratio)
3. Recording format is WebM only (VP8 + Opus)
4. No pause/resume functionality (would require additional implementation)
5. Maximum recording length limited by available memory
6. PiP webcam resolution limited to 320x240 for performance
7. Old recordings without duration metadata will show `0:00` and cannot be added to timeline

## Future Enhancements

- Configurable PiP position and size
- Pause/resume recording
- Recording countdown timer
- Hotkey support (Ctrl+R to start/stop)
- Audio level indicators
- Video preview during recording (not just before)
- Recording quality presets (720p, 1080p, 4K)
- Direct MP4 recording (would require FFmpeg integration)
- Recording highlights (mark important moments)
- Auto-save to specific folder

## Recent Updates (October 2025)

### WebM Duration Metadata Fix
- Integrated `fix-webm-duration` library to resolve duration metadata issues
- All new recordings now have correct duration metadata
- Enhanced validation throughout app to handle edge cases
- Improved error messages for invalid clips

### Code Quality Improvements
- Removed excessive debug logging from production code
- Kept essential error and warning logs
- Added comprehensive validation to prevent crashes
- Enhanced FFprobe logging for better debugging

### UX Enhancements
- Double-click media library items to show in folder
- Better error messages when adding invalid clips to timeline
- Protected against Infinity and NaN duration values

## Conclusion

The recording feature is fully implemented and integrated with the existing Star-Forge application. Users can now record screen, webcam, or both with configurable audio, and the recordings automatically appear in the media library ready for editing and export. The recent duration metadata fix ensures all recordings work seamlessly in the timeline editor.

