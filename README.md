# ClipForge

Desktop video editor built with Electron + Vue + FFmpeg

## Tech Stack

- **Electron 32** - Desktop framework
- **Vue 3** - Reactive UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Pinia** - State management
- **Tailwind CSS** - Styling
- **shadcn-vue** - UI components
- **FFmpeg.wasm** - Video processing

## Project Structure

```
clipforge2/
├── electron/          # Electron main process
│   └── main.ts
├── src/
│   ├── components/    # Vue components
│   │   └── ui/        # shadcn-vue components
│   ├── stores/        # Pinia stores
│   │   ├── clips.ts
│   │   ├── timeline.ts
│   │   ├── export.ts
│   │   └── recording.ts
│   ├── lib/           # Utilities
│   ├── assets/        # CSS and static assets
│   ├── App.vue        # Root component
│   └── main.ts        # Vue entry point
└── index.html
```

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

This will start the Electron app with hot-reload enabled.

### Build

```bash
npm run build
```

This will create a distributable package for your platform.

## Layer 1 Status: ✅ Complete

- [x] Electron + Vue + TypeScript project structure
- [x] Pinia stores for state management
- [x] Tailwind CSS configuration
- [x] shadcn-vue UI components (Button, Input, Progress, Slider, Dialog)
- [x] FFmpeg.wasm for video processing
- [x] Hot reload development environment

## Next Steps (Layer 2)

- File import functionality
- Video preview player
- Basic export with FFmpeg.wasm

## Notes

- **editly removed**: The original plan included editly, but it has native dependencies that require Visual Studio C++ build tools on Windows. We're using FFmpeg.wasm instead, which is pure JavaScript and works cross-platform.
- **Video.js**: Will be added in Layer 3 when we need frame-accurate trimming

