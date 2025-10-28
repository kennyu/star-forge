<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useClipStore } from '@/stores/clips'
import { useTimelineStore } from '@/stores/timeline'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

const clipStore = useClipStore()
const timelineStore = useTimelineStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const player = ref<Player | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(100)

// Playback state
const isTimelinePlaying = ref(false)
const nextClipToPreload = ref<number>(-1)

// Get the selected clip
const selectedClip = computed(() => {
  if (!clipStore.selectedClipId) return null
  return clipStore.getClipById(clipStore.selectedClipId)
})

// Initialize Video.js player
onMounted(() => {
  if (videoRef.value) {
    player.value = videojs(videoRef.value, {
      controls: false, // We'll use custom controls
      fluid: false,
      responsive: false,
      preload: 'metadata',
      playbackRates: [0.25, 0.5, 1, 1.5, 2],
    })

    // Listen to player events
    player.value.on('play', () => {
      isPlaying.value = true
    })

    player.value.on('pause', () => {
      isPlaying.value = false
    })

    player.value.on('timeupdate', () => {
      if (player.value) {
        currentTime.value = player.value.currentTime() || 0
        
        // Handle timeline playback clip switching
        if (isTimelinePlaying.value) {
          handleTimelinePlayback()
        }
      }
    })

    player.value.on('loadedmetadata', () => {
      if (player.value) {
        duration.value = player.value.duration() || 0
      }
    })

    player.value.on('ended', () => {
      isPlaying.value = false
      
      // If timeline playing, try to advance to next clip
      if (isTimelinePlaying.value) {
        advanceToNextClip()
      }
    })

    // Load initial clip if available
    if (selectedClip.value) {
      player.value.src({ src: `file://${selectedClip.value.path}`, type: 'video/mp4' })
    }
  }
})

// Watch for clip changes and load new video
watch(selectedClip, (newClip) => {
  if (newClip && player.value) {
    player.value.src({ src: `file://${newClip.path}`, type: 'video/mp4' })
    player.value.load()
    currentTime.value = 0
    isPlaying.value = false
  }
})

// Watch for timeline play state changes
watch(() => timelineStore.isPlaying, (playing) => {
  console.log('[VideoPlayer Watch] Timeline isPlaying changed to:', playing)
  console.log('[VideoPlayer Watch] isTimelinePlaying.value:', isTimelinePlaying.value)
  console.log('[VideoPlayer Watch] player.value exists:', !!player.value)
  console.log('[VideoPlayer Watch] timeline clips count:', timelineStore.clips.length)
  
  if (playing && !isTimelinePlaying.value) {
    console.log('[VideoPlayer Watch] Triggering playFromPlayhead()')
    // Start timeline playback
    playFromPlayhead()
  } else if (!playing && isTimelinePlaying.value) {
    console.log('[VideoPlayer Watch] Triggering stopTimelinePlayback()')
    // Stop timeline playback
    stopTimelinePlayback()
  } else {
    console.log('[VideoPlayer Watch] No action taken')
  }
})

// Sync video player with timeline playhead
watch(() => timelineStore.playheadTime, (newTime) => {
  if (!player.value || isPlaying.value) return
  
  // Find which timeline clip contains this time
  const currentTimelineClip = timelineStore.clips.find(clip =>
    newTime >= clip.startTime && newTime < clip.startTime + clip.duration
  )
  
  if (!currentTimelineClip) return
  
  // Get the source clip
  const sourceClip = clipStore.getClipById(currentTimelineClip.clipId)
  if (!sourceClip) return
  
  // Calculate time within the clip (accounting for trim)
  const timeInTimeline = newTime - currentTimelineClip.startTime
  const timeInSourceClip = currentTimelineClip.trimStart + timeInTimeline
  
  // Load clip if different from current
  if (clipStore.selectedClipId !== currentTimelineClip.clipId) {
    clipStore.selectClip(currentTimelineClip.clipId)
  }
  
  // Seek to the correct position
  const playerCurrentTime = player.value?.currentTime?.()
  if (player.value && playerCurrentTime !== undefined && Math.abs(playerCurrentTime - timeInSourceClip) > 0.1) {
    player.value.currentTime(timeInSourceClip)
  }
})

// Play timeline from current playhead position
const playFromPlayhead = async () => {
  console.log('[VideoPlayer] ========== PLAY FROM PLAYHEAD ==========')
  console.log('[VideoPlayer] playFromPlayhead() called')
  console.log('[VideoPlayer] player.value:', !!player.value)
  console.log('[VideoPlayer] timeline clips:', timelineStore.clips.length)
  console.log('[VideoPlayer] playheadTime:', timelineStore.playheadTime)
  console.log('[VideoPlayer] isTimelinePlaying:', isTimelinePlaying.value)
  
  if (!player.value || timelineStore.clips.length === 0) {
    console.error('[VideoPlayer] Cannot play: player or clips missing')
    return
  }
  
  console.log('[VideoPlayer] Starting timeline playback from:', timelineStore.playheadTime)
  
  // Find clip at current playhead position
  console.log('[VideoPlayer] Calling getClipIndexAtTime with:', timelineStore.playheadTime)
  const startClipIndex = timelineStore.getClipIndexAtTime(timelineStore.playheadTime)
  console.log('[VideoPlayer] Found clip index:', startClipIndex)
  
  if (startClipIndex === -1) {
    console.warn('[VideoPlayer] No clip at current playhead position')
    console.warn('[VideoPlayer] Timeline clips:', timelineStore.clips.map(c => ({
      name: c.name,
      startTime: c.startTime,
      duration: c.duration,
      endTime: c.startTime + c.duration
    })))
    return
  }
  
  console.log('[VideoPlayer] Setting up playback state')
  isTimelinePlaying.value = true
  timelineStore.setPlaybackClip(startClipIndex)
  timelineStore.startPlayback()
  
  console.log('[VideoPlayer] Loading and playing clip', startClipIndex)
  // Load and play the clip
  await loadAndPlayClip(startClipIndex)
  
  console.log('[VideoPlayer] Clip loaded and playing')
  
  // Preload next clip if exists
  if (startClipIndex + 1 < timelineStore.clips.length) {
    console.log('[VideoPlayer] Preloading next clip', startClipIndex + 1)
    preloadClip(startClipIndex + 1)
  }
}

// Load and play a specific timeline clip
const loadAndPlayClip = async (clipIndex: number) => {
  if (!player.value || clipIndex < 0 || clipIndex >= timelineStore.clips.length) return
  
  const timelineClip = timelineStore.clips[clipIndex]
  const sourceClip = clipStore.getClipById(timelineClip.clipId)
  
  if (!sourceClip) {
    console.error('[VideoPlayer] Source clip not found:', timelineClip.clipId)
    return
  }
  
  console.log('[VideoPlayer] Loading clip', clipIndex, ':', timelineClip.name)
  
  // Load the source video
  player.value.src({ src: `file://${sourceClip.path}`, type: 'video/mp4' })
  
  // Calculate where to start playing within the source clip
  const timeInTimeline = timelineStore.playheadTime - timelineClip.startTime
  const startTimeInSource = timelineClip.trimStart + Math.max(0, timeInTimeline)
  
  // Wait for video to be ready
  await new Promise<void>((resolve) => {
    const onLoadedData = () => {
      if (player.value) {
        player.value.off('loadeddata', onLoadedData)
        player.value.currentTime(startTimeInSource)
        resolve()
      }
    }
    player.value?.on('loadeddata', onLoadedData)
    player.value?.load()
  })
  
  // Start playing
  await player.value.play()
}

// Handle timeline playback updates
const handleTimelinePlayback = () => {
  if (!player.value || timelineStore.currentPlaybackClipIndex === -1) return
  
  const currentClipIndex = timelineStore.currentPlaybackClipIndex
  const timelineClip = timelineStore.clips[currentClipIndex]
  
  if (!timelineClip) return
  
  // Calculate current position in source clip
  const currentTimeInSource = player.value.currentTime() || 0
  const timeFromTrimStart = currentTimeInSource - timelineClip.trimStart
  
  // Update timeline playhead
  const newPlayheadTime = timelineClip.startTime + timeFromTrimStart
  timelineStore.setPlayhead(newPlayheadTime)
  
  // Log every second for debugging
  if (Math.floor(newPlayheadTime) !== Math.floor(timelineStore.playheadTime)) {
    console.log('[VideoPlayer] Playhead at:', newPlayheadTime.toFixed(2), 'clip:', currentClipIndex)
  }
  
  // Check if we've reached the end of this clip's trimmed section
  if (currentTimeInSource >= timelineClip.trimEnd - 0.1) {
    console.log('[VideoPlayer] Reached end of clip', currentClipIndex)
    advanceToNextClip()
  }
}

// Advance to next clip in timeline
const advanceToNextClip = async () => {
  const currentIndex = timelineStore.currentPlaybackClipIndex
  const nextIndex = currentIndex + 1
  
  console.log('[VideoPlayer] Advancing from clip', currentIndex, 'to', nextIndex)
  
  if (nextIndex >= timelineStore.clips.length) {
    // Reached end of timeline
    console.log('[VideoPlayer] Reached end of timeline')
    stopTimelinePlayback()
    return
  }
  
  // Move to next clip
  timelineStore.setPlaybackClip(nextIndex)
  const nextClip = timelineStore.clips[nextIndex]
  timelineStore.setPlayhead(nextClip.startTime)
  
  // Load and play next clip
  await loadAndPlayClip(nextIndex)
  
  // Preload the clip after this one
  if (nextIndex + 1 < timelineStore.clips.length) {
    preloadClip(nextIndex + 1)
  }
}

// Preload next clip for smooth transitions
const preloadClip = (clipIndex: number) => {
  if (clipIndex < 0 || clipIndex >= timelineStore.clips.length) return
  
  const timelineClip = timelineStore.clips[clipIndex]
  const sourceClip = clipStore.getClipById(timelineClip.clipId)
  
  if (!sourceClip) return
  
  console.log('[VideoPlayer] Preloading clip', clipIndex, ':', timelineClip.name)
  nextClipToPreload.value = clipIndex
  
  // Create a temporary video element to preload
  const preloadVideo = document.createElement('video')
  preloadVideo.src = `file://${sourceClip.path}`
  preloadVideo.preload = 'auto'
  preloadVideo.load()
}

// Stop timeline playback
const stopTimelinePlayback = () => {
  console.log('[VideoPlayer] Stopping timeline playback')
  
  isTimelinePlaying.value = false
  
  if (player.value) {
    player.value.pause()
  }
  
  // Update store state if not already stopped
  if (timelineStore.isPlaying) {
    timelineStore.stopPlayback()
  }
  
  console.log('[VideoPlayer] Stopped at playhead:', timelineStore.playheadTime)
}

// Play/Pause toggle
const togglePlayPause = () => {
  if (!player.value) return
  
  if (isPlaying.value || isTimelinePlaying.value) {
    // Stop playback
    stopTimelinePlayback()
    player.value.pause()
  } else {
    // Start timeline playback from current position
    playFromPlayhead()
  }
}

// Seek controls
const handleSeek = (value: number) => {
  if (!player.value) return
  player.value.currentTime(value)
}

const skipBackward = () => {
  if (!player.value) return
  const current = player.value.currentTime() || 0
  player.value.currentTime(Math.max(0, current - 5))
}

const skipForward = () => {
  if (!player.value) return
  const current = player.value.currentTime() || 0
  player.value.currentTime(Math.min(duration.value, current + 5))
}

// Volume controls
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

// Cleanup on unmount
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
      <span v-if="selectedClip" class="text-sm text-muted-foreground">
        {{ selectedClip.name }}
      </span>
    </div>

    <!-- Video Container -->
    <div class="relative rounded-lg border bg-black aspect-video overflow-hidden">
      <!-- No clip selected state -->
      <div
        v-if="!selectedClip"
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
          <p class="text-lg">Select a clip to preview</p>
        </div>
      </div>

      <!-- Video Element with Video.js -->
      <video
        v-if="selectedClip"
        ref="videoRef"
        class="video-js vjs-big-play-centered w-full h-full"
      ></video>
    </div>

    <!-- Controls -->
    <div v-if="selectedClip" class="space-y-3">
      <!-- Timeline/Seek Bar -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted-foreground w-12 text-right">
          {{ formatTime(currentTime) }}
        </span>
        <Slider
          :model-value="currentTime"
          :max="duration || 100"
          :step="0.1"
          @update:model-value="handleSeek"
          class="flex-1"
        />
        <span class="text-sm text-muted-foreground w-12">
          {{ formatTime(duration) }}
        </span>
      </div>

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
            v-if="!isPlaying"
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
          <span class="ml-2">{{ isPlaying ? 'Pause' : 'Play' }}</span>
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


