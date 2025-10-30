<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { usePlaybackStore } from '@/stores/playback'
import { useTimelineStore } from '@/stores/timeline'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

/**
 * Video Player Component
 * 
 * Responsibilities:
 * - Display video content
 * - Control video.js player instance
 * - Report playback events to playback store
 * - React to playback commands from store
 * 
 * Does NOT:
 * - Manage timeline sequencing (that's in playback store)
 * - Handle clip transitions (that's in playback store)
 * - Track playhead position (that's in playback store)
 */

const playbackStore = usePlaybackStore()
const timelineStore = useTimelineStore()

const videoRef = ref<HTMLVideoElement | null>(null)
const player = ref<Player | null>(null)
const volume = ref(100)

// Check if we should show the video player
const shouldShowPlayer = computed(() => {
  return timelineStore.clips.length > 0
})

// ============================================================================
// Player Initialization
// ============================================================================

function initializePlayer() {
  if (!videoRef.value || player.value) return
  
  // Enable hardware acceleration attributes on video element
  videoRef.value.setAttribute('playsinline', '')
  videoRef.value.setAttribute('webkit-playsinline', '')
  
  player.value = videojs(videoRef.value, {
    controls: false,
    fluid: false,
    responsive: false,
    preload: 'auto', // Changed from 'metadata' for smoother buffering
    playbackRates: [0.25, 0.5, 1, 1.5, 2],
    // Hardware acceleration and performance optimizations
    techOrder: ['html5'], // Use HTML5 tech with hardware acceleration
    html5: {
      nativeVideoTracks: false,
      nativeAudioTracks: false,
      nativeTextTracks: false,
      hls: {
        overrideNative: true,
        enableLowInitialPlaylist: true,
      },
    },
  })

  // Listen to player events and report to playback store
  player.value.on('timeupdate', () => {
    if (!player.value) return
    
    const time = player.value.currentTime() || 0
    
    // Report time to playback store (it will handle clip transitions)
    if (playbackStore.isPlaying) {
      playbackStore.updateTime(time)
    }
  })

  player.value.on('ended', () => {
    // Playback store will handle advancing to next clip via updateTime
  })

  player.value.on('error', (error: any) => {
    console.error('[VideoPlayer] Playback error:', error)
  })
}

// Initialize player when clips are added (or on mount if clips already exist)
watch(shouldShowPlayer, async (shouldShow) => {
  if (shouldShow && !player.value) {
    // Wait for DOM to render video element
    await nextTick()
    initializePlayer()
  }
}, { immediate: true, flush: 'post' })

// ============================================================================
// Playback Control - React to Store Commands
// ============================================================================

// Watch for play command from store
watch(() => playbackStore.isPlaying, async (playing) => {
  // If player not initialized yet, wait for it
  if (!player.value) {
    if (shouldShowPlayer.value) {
      // Wait for the video element to render and player to initialize
      await nextTick()
      // Give initialization time to complete
      let attempts = 0
      while (!player.value && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 50))
        attempts++
      }
      
      if (!player.value) {
        console.error('[VideoPlayer] Cannot respond to play command: player failed to initialize')
        playbackStore.pause() // Reset state
        return
      }
    } else {
      playbackStore.pause() // Reset state
      return
    }
  }
  
  if (playing) {
    await loadAndPlayCurrentClip()
  } else {
    player.value.pause()
  }
})

// Watch for clip changes during playback
watch(() => playbackStore.currentClipIndex, async (newIndex, oldIndex) => {
  if (newIndex === -1 || newIndex === oldIndex || !playbackStore.isPlaying) return
  
  await loadAndPlayCurrentClip()
})

/**
 * Get MIME type from file path
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop()
  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
  }
  return mimeTypes[ext || ''] || 'video/mp4' // Default to mp4 if unknown
}

/**
 * Load and play the current clip from playback store
 */
async function loadAndPlayCurrentClip() {
  if (!player.value) return
  
  const source = playbackStore.currentVideoSource
  const startTime = playbackStore.currentVideoStartTime
  
  if (!source) {
    console.error('[VideoPlayer] No video source to play')
    return
  }
  
  const mimeType = getMimeType(source)
  
  // Load the video source with correct MIME type
  player.value.src({ src: `file://${source}`, type: mimeType })
  
  // Wait for video to be ready, then seek and play
  await new Promise<void>((resolve) => {
    const onLoadedData = () => {
      if (player.value) {
        player.value.off('loadeddata', onLoadedData)
        player.value.currentTime(startTime)
        resolve()
      }
    }
    player.value?.on('loadeddata', onLoadedData)
    player.value?.load()
  })
  
  // Wait for seek to complete before allowing UI updates
  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      if (player.value) {
        player.value.off('seeked', onSeeked)
        // Mark clip as ready - allows timeupdate events to update UI
        playbackStore.markClipReady()
        resolve()
      }
    }
    player.value?.on('seeked', onSeeked)
  })
  
  // Start playing
  try {
    await player.value.play()
  } catch (error) {
    console.error('[VideoPlayer] Play failed:', error)
  }
}

// ============================================================================
// Preview Mode (when not playing)
// ============================================================================

// When playhead changes and not playing, show preview
watch(() => playbackStore.currentTime, (newTime) => {
  if (playbackStore.isPlaying || !player.value) return
  
  const clipInfo = playbackStore.getClipAtTime(newTime)
  
  if (!clipInfo) return
  
  const { sourceClip, timeInSource } = clipInfo
  
  // Load video if different
  const currentSrc = player.value.currentSrc()
  const newSrc = `file://${sourceClip.path}`
  
  if (!currentSrc.includes(sourceClip.path)) {
    const mimeType = getMimeType(sourceClip.path)
    player.value.src({ src: newSrc, type: mimeType })
    player.value.load()
  }
  
  // Seek to position
  const currentPlayerTime = player.value.currentTime() || 0
  if (Math.abs(currentPlayerTime - timeInSource) > 0.1) {
    player.value.currentTime(timeInSource)
  }
})

// ============================================================================
// Direct Player Controls (for testing/manual control)
// ============================================================================

const togglePlayPause = () => {
  playbackStore.togglePlayPause()
}

const skipBackward = () => {
  const newTime = Math.max(0, playbackStore.currentTime - 5)
  playbackStore.seekTo(newTime)
}

const skipForward = () => {
  const newTime = Math.min(timelineStore.totalDuration, playbackStore.currentTime + 5)
  playbackStore.seekTo(newTime)
}

const handleVolumeChange = (value: number) => {
  if (!player.value) return
  volume.value = value
  player.value.volume(value / 100)
}

const toggleMute = () => {
  if (!player.value) return
  player.value.muted(!player.value.muted())
}

// Format time as MM:SS
const formatTime = (seconds: number) => {
  if (!isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ============================================================================
// Cleanup
// ============================================================================

onBeforeUnmount(() => {
  if (player.value) {
    player.value.dispose()
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">Preview</h2>
      <span v-if="playbackStore.currentSourceClip" class="text-sm text-muted-foreground">
        {{ playbackStore.currentSourceClip.name }}
      </span>
    </div>

    <!-- Video Container -->
    <div class="relative rounded-lg border bg-black aspect-video overflow-hidden">
      <!-- No clip selected state -->
      <div
        v-if="!shouldShowPlayer"
        class="absolute inset-0 flex items-center justify-center text-muted-foreground"
      >
        <div class="text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="mx-auto mb-4"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <p class="text-lg">Add clips to timeline to get started</p>
        </div>
      </div>

      <!-- Video Element with Video.js -->
      <video
        v-if="shouldShowPlayer"
        ref="videoRef"
        class="video-js vjs-big-play-centered w-full h-full"
        playsinline
        webkit-playsinline
        style="
          image-rendering: auto;
          transform: translateZ(0);
          will-change: transform;
          backface-visibility: hidden;
        "
      ></video>
    </div>

    <!-- Controls -->
    <div v-if="shouldShowPlayer" class="space-y-3">
      <!-- Playback Controls -->
      <div class="flex items-center justify-center gap-2">
        <Button
          @click="skipBackward"
          variant="outline"
          size="icon"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 20L9 12L19 4" />
            <line x1="5" y1="4" x2="5" y2="20" />
          </svg>
        </Button>
        <Button
          @click="togglePlayPause"
          size="lg"
        >
          <svg
            v-if="!playbackStore.isPlaying"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          <span class="ml-2">{{ playbackStore.isPlaying ? 'Pause' : 'Play' }}</span>
        </Button>
        <Button
          @click="skipForward"
          variant="outline"
          size="icon"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M5 4L15 12L5 20" />
            <line x1="19" y1="4" x2="19" y2="20" />
          </svg>
        </Button>
        
        <!-- Volume Controls -->
        <div class="flex items-center gap-2 ml-4">
          <Button
            @click="toggleMute"
            variant="ghost"
            size="icon"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </Button>
          <Slider
            :model-value="volume"
            :min="0"
            :max="100"
            :step="1"
            @update:model-value="handleVolumeChange"
            class="w-24"
          />
        </div>
      </div>
    </div>
  </div>
</template>

