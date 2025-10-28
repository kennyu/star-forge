<!-- 8b647fc4-769b-44c5-8741-13403fbe912e fb3241c4-23bd-4a56-9ee2-4ccf46d44f34 -->
# ClipForge - Layered Feature Build Plan

## Technology Stack

### Core Processing

- **Editly** - Declarative video editing (JSON config → video)
- **FFmpeg.wasm** - Browser-based FFmpeg for previews and metadata
- **Electron 32** - Desktop framework with native APIs

### UI & Frontend  

- **Vue 3 + TypeScript** - Reactive UI framework
- **Tailwind CSS** - Utility-first styling
- **shadcn-vue** - High-quality component library
- **Pinia** - State management

### Video Playback

- **Raw HTML5 `<video>`** (Layer 2) - Simple preview
- **Video.js** (Layer 3+) - Frame-accurate seeking for trimming

### Recording

- **Native MediaRecorder API** - Screen and audio capture (can revisit RecordRTC later)

---

## Layer 1: Foundation & Project Setup

**Goal:** Establish the basic Electron + Vue + TypeScript application structure with UI framework

### Core Setup

- Initialize Electron + Vue 3 + Vite project with TypeScript
  - Use `electron-vite-vue` template: `npm create @quick-start/electron`
  - Or `vite-electron-builder` template
- Configure main process (Electron) and renderer process (Vue)
- Set up Pinia store scaffolding
- Install video processing: `editly`, `@ffmpeg/ffmpeg`

### UI Framework Setup (~30 min total)

1. **Tailwind CSS** (~10 min)

   - Install: `npm i -D tailwindcss postcss autoprefixer`
   - Initialize: `npx tailwindcss init -p`
   - Configure for Electron (content paths)
   - Create `src/assets/index.css` with Tailwind directives

2. **shadcn-vue** (~5 min)

   - Run: `npx shadcn-vue@latest init`
   - Configure theme (colors, border radius, CSS variables)
   - Enable dark mode (optional)

3. **Essential Components** (~15 min)
   ```bash
   npx shadcn-vue@latest add button
   npx shadcn-vue@latest add dialog  
   npx shadcn-vue@latest add input
   npx shadcn-vue@latest add progress
   npx shadcn-vue@latest add slider
   ```


### Project Structure

```
clipforge2/
├── electron/
│   └── main.ts              # Main process
├── src/
│   ├── App.vue              # Root component
│   ├── main.ts              # Vue entry
│   ├── stores/              # Pinia stores
│   ├── components/
│   │   └── ui/              # shadcn-vue components (Button, Dialog, etc.)
│   └── assets/
│       └── index.css        # Tailwind @import directives
├── tailwind.config.js
├── components.json          # shadcn-vue config
├── package.json
└── vite.config.ts
```

**Success Criteria:**

- App launches with Tailwind styling
- shadcn Button renders correctly
- Hot reload works in development

---

## Layer 2: Media Pipeline (First Milestone)

**Goal:** Prove the complete video workflow: Import → Preview → Export

### 2A: File Import

- Native Electron file picker dialog (`dialog.showOpenDialog`)
- Drag-and-drop zone using shadcn-vue Card component
- Accept MP4, MOV, WebM formats
- Read file metadata using FFmpeg.wasm probe
- Store imported clips in Pinia store with:
  - File path, name, duration, resolution, size

### 2B: Video Preview Player

- **Raw HTML5 `<video>` element** (sufficient for MVP)
- Basic controls: play/pause, seek bar, current time
- Display selected clip from filesystem
- Use `file://` protocol or Electron's `protocol.registerFileProtocol`
- Loading states with shadcn Progress component

### 2C: Simple Export with Editly

- Convert single clip to Editly config:
  ```javascript
  {
    outPath: 'output.mp4',
    clips: [{ path: 'input.mp4' }]
  }
  ```

- Show export dialog (shadcn Dialog + Progress)
- Track progress from Editly's events
- Success notification
- Open output folder button

**Success Criteria:**

- User can import a video file
- Preview plays correctly
- Export creates valid MP4

---

## Layer 3: Timeline Editor

**Goal:** Enable multi-clip arrangement and basic editing

### 3A: Timeline UI (Native Vue + CSS)

- **No Canvas libraries** - use HTML divs + CSS Grid/Flexbox
- Scrollable timeline container (Tailwind utility classes)
- Clip blocks as draggable divs with:
  - Thumbnail preview (extract with FFmpeg.wasm)
  - Duration display
  - Trim handles (left/right edges)
- Playhead indicator (absolute positioned div)
- Zoom controls (shadcn Slider)
- Time ruler with markers

### 3B: Clip Management

- Media library panel (shadcn Card components)
- Add clips to timeline (drag-drop or button click)
- HTML5 Drag and Drop API:
  ```javascript
  @dragstart, @dragover, @drop
  ```

- Select/highlight active clip
- Delete clips (shadcn Button with trash icon)
- Reorder clips via drag-drop

### 3C: Trim & Split

- **Upgrade to Video.js** for frame-accurate seeking
- Trim handles on clip edges (CSS resize handles)
- Set in/out points with markers
- Split clip at playhead (creates two clips)
- Update Pinia store with trim metadata:
  ```javascript
  {
    cutFrom: 5,  // start at 5 seconds
    cutTo: 15    // end at 15 seconds
  }
  ```


### 3D: Multi-Clip Export with Editly

- Convert timeline clips → Editly config:
  ```javascript
  {
    outPath: 'output.mp4',
    clips: timelineClips.map(clip => ({
      path: clip.filePath,
      duration: clip.duration,
      cutFrom: clip.trimStart,
      cutTo: clip.trimEnd
    }))
  }
  ```

- Concatenate all clips in timeline order
- Show progress (shadcn Progress component)
- Export quality options (720p, 1080p, source)

**Success Criteria:**

- User can arrange 3+ clips on timeline
- Trim clips with visual feedback
- Export creates single continuous video

---

## Layer 4: Recording Capabilities

**Goal:** Add screen and audio recording to capture new content

### 4A: Screen Recording (Native MediaRecorder)

- Screen source picker using Electron `desktopCapturer`
  - List available screens/windows
  - Preview thumbnails (shadcn Dialog with grid)
- MediaRecorder API for recording:
  ```javascript
  const stream = await navigator.mediaDevices.getDisplayMedia();
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9'
  });
  ```

- Record controls (shadcn Button: Start/Stop/Pause)
- Save recording to temp folder
- Auto-add to media library

### 4B: Audio Capture

- Microphone selection (shadcn Select dropdown)
- List audio devices: `navigator.mediaDevices.enumerateDevices()`
- Audio level indicator (shadcn Progress as VU meter)
- Combine system audio + microphone in single recording
- Audio sync with video

### 4C: Recording UI

- Floating recording panel (shadcn Card, draggable)
- Timer display (MM:SS format)
- File size indicator (real-time)
- Save options: auto-save vs save dialog

**Success Criteria:**

- User can record screen + audio
- Recording auto-imports to media library
- Can add recording to timeline and edit

---

## Layer 5: Advanced Editing Features

**Goal:** Enhance editing capabilities with professional features

### 5A: Timeline Enhancements

- Multiple video tracks (2-3 layers)
- Audio waveform visualization (optional, using Web Audio API)
- Snap-to-playhead feature
- Keyboard shortcuts:
  - Space = play/pause
  - I/O = set in/out points
  - Delete = remove clip
  - Ctrl+Z = undo

### 5B: Effects & Filters (via Editly)

- Text overlays (Editly's text layer):
  ```javascript
  {
    type: 'title',
    text: 'Hello World',
    position: { x: 0.5, y: 0.5 }
  }
  ```

- Transitions (Editly built-in):
  - Fade, crossfade, slide
- Basic color adjustments (Editly filters)

### 5C: Undo/Redo

- Command pattern for timeline actions
- History stack in Pinia store
- Max 50 history states (memory management)
- Clear history on export

**Success Criteria:**

- User can create multi-layered compositions
- Text overlays work
- Undo/redo functions correctly

---

## Layer 6: Polish & Packaging

**Goal:** Optimize performance and create distributable builds

### 6A: Performance Optimization

- Thumbnail caching (IndexedDB or local storage)
- Virtual scrolling for large media libraries
- Lazy load video elements (only load visible clips)
- Web Workers for FFmpeg operations (keep UI responsive)
- Memory leak prevention:
  - Revoke object URLs
  - Cleanup MediaStream tracks
  - Abort FFmpeg processes on cancel

### 6B: Build & Package

- Configure `electron-builder` for multi-platform:
  ```json
  {
    "win": { "target": "nsis" },
    "mac": { "target": "dmg" },
    "linux": { "target": "AppImage" }
  }
  ```

- App icons (1024x1024 source)
- Code signing (optional, for Mac)
- Auto-update setup (optional)
- Build scripts in package.json

### 6C: Documentation & Demo

- README with:
  - Screenshots
  - Setup instructions
  - Build commands
  - Tech stack diagram
- Demo video (3-5 min):
  - Import clips
  - Arrange on timeline
  - Record screen
  - Export final video
- Troubleshooting guide

**Success Criteria:**

- `.exe` and `.dmg` builds work
- App launches in <5 seconds
- Handles 10+ clips smoothly (30 fps preview)

---

## Key Implementation Notes

### Editly Configuration Example

```javascript
import editly from 'editly';

const timelineConfig = {
  outPath: '/path/to/output.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  audioNorm: true,
  clips: [
    {
      layers: [
        { type: 'video', path: 'clip1.mp4', cutFrom: 5, cutTo: 15 }
      ]
    },
    {
      layers: [
        { type: 'video', path: 'clip2.mp4' },
        { type: 'title', text: 'Hello', position: { x: 0.5, y: 0.1 } }
      ]
    }
  ]
};

await editly(timelineConfig);
```

### FFmpeg.wasm Usage (Metadata)

```javascript
import { FFmpeg } from '@ffmpeg/ffmpeg';

const ffmpeg = new FFmpeg();
await ffmpeg.load();

// Get video metadata
await ffmpeg.writeFile('input.mp4', await fetchFile(file));
const metadata = await ffmpeg.exec(['-i', 'input.mp4']);
```

### Pinia Store Structure

```typescript
// stores/clips.ts
export const useClipStore = defineStore('clips', {
  state: () => ({
    importedClips: [],
    selectedClipId: null
  }),
  actions: {
    addClip(clip) { /* ... */ },
    removeClip(id) { /* ... */ }
  }
});

// stores/timeline.ts
export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    clips: [],        // ordered array
    playheadTime: 0,
    zoom: 1
  }),
  getters: {
    totalDuration: (state) => /* sum clip durations */
  }
});
```

### Dependencies

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "pinia": "^2.1.0",
    "editly": "^0.14.0",
    "@ffmpeg/ffmpeg": "^0.12.0",
    "electron": "^32.0.0",
    "video.js": "^8.10.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "electron-builder": "^24.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0"
  }
}
```

**Note:** shadcn-vue is not an npm dependency - components are copied into your project via CLI.

### To-dos

- [ ] Set up Electron + Vue + TypeScript project with Pinia and FFmpeg
- [ ] Implement file import with drag-drop and metadata reading
- [ ] Build video preview player with playback controls
- [ ] Implement single-clip export to MP4 with progress tracking
- [ ] Create timeline UI with clips, playhead, and zoom controls
- [ ] Add clip management: add, remove, reorder, trim, split
- [ ] Implement multi-clip concatenation and export
- [ ] Add screen and audio recording with auto-import to library
- [ ] Implement multi-track, effects, and undo/redo (stretch)
- [ ] Optimize performance and create distributable builds