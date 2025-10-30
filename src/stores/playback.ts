import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTimelineStore } from './timeline'
import { useClipStore } from './clips'

/**
 * Central Playback Controller
 * 
 * This store is the single source of truth for playback state.
 * It orchestrates timeline playback, clip sequencing, and synchronization.
 * 
 * Responsibilities:
 * - Manage playback state (playing/paused)
 * - Track current playback position
 * - Determine which clip should be playing
 * - Handle clip transitions
 * - Coordinate between Timeline and VideoPlayer
 */
export const usePlaybackStore = defineStore('playback', () => {
  const timelineStore = useTimelineStore()
  const clipStore = useClipStore()

  // ============================================================================
  // State
  // ============================================================================
  
  /** Whether timeline is currently playing */
  const isPlaying = ref(false)
  
  /** Current playhead time in timeline coordinates (seconds) */
  const currentTime = ref(0)
  
  /** Index of the currently playing clip in timeline */
  const currentClipIndex = ref(-1)
  
  /** Cache of the video source path for the current clip */
  const currentVideoSource = ref<string | null>(null)
  
  /** Time to start playing within the current video source (accounting for trim) */
  const currentVideoStartTime = ref(0)
  
  /** Time to stop playing within the current video source (accounting for trim) */
  const currentVideoEndTime = ref(0)
  
  /** Flag to indicate we're loading a new clip (prevents UI jumps during seek) */
  const isLoadingClip = ref(false)

  // ============================================================================
  // Computed
  // ============================================================================
  
  /** Get the current timeline clip being played */
  const currentTimelineClip = computed(() => {
    if (currentClipIndex.value === -1) return null
    return timelineStore.clips[currentClipIndex.value] || null
  })
  
  /** Get the source clip from the media library */
  const currentSourceClip = computed(() => {
    if (!currentTimelineClip.value) return null
    return clipStore.getClipById(currentTimelineClip.value.clipId)
  })

  // ============================================================================
  // Playback Control
  // ============================================================================
  
  /**
   * Start timeline playback from current playhead position
   */
  function play() {
    if (timelineStore.clips.length === 0) {
      return
    }
    
    // Find clip at current playhead position
    const clipIndex = findClipIndexAtTime(currentTime.value)
    
    if (clipIndex === -1) {
      return
    }
    
    // Set up playback state
    currentClipIndex.value = clipIndex
    loadCurrentClip()
    isPlaying.value = true
  }
  
  /**
   * Pause timeline playback
   */
  function pause() {
    isPlaying.value = false
  }
  
  /**
   * Toggle play/pause
   */
  function togglePlayPause() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }
  
  /**
   * Stop playback and reset
   */
  function stop() {
    isPlaying.value = false
    currentClipIndex.value = -1
    currentVideoSource.value = null
  }

  // ============================================================================
  // Time Management
  // ============================================================================
  
  /**
   * Seek to a specific time in the timeline
   */
  function seekTo(time: number) {
    const clampedTime = Math.max(0, Math.min(time, timelineStore.totalDuration))
    currentTime.value = clampedTime
    
    // If playing, update the current clip
    if (isPlaying.value) {
      const clipIndex = findClipIndexAtTime(clampedTime)
      
      if (clipIndex !== currentClipIndex.value) {
        // Changed clip, need to load new one
        if (clipIndex === -1) {
          stop()
        } else {
          currentClipIndex.value = clipIndex
          loadCurrentClip()
        }
      }
    }
  }
  
  /**
   * Update current time during playback
   * Called by VideoPlayer on timeupdate events
   * 
   * @param videoTime - Current time within the video source file
   */
  function updateTime(videoTime: number) {
    if (!isPlaying.value || !currentTimelineClip.value) return
    
    // Ignore stale timeupdate events while loading a new clip (prevents UI jumps)
    if (isLoadingClip.value) return
    
    const clip = currentTimelineClip.value
    
    // Calculate timeline position from video time
    const timeFromTrimStart = videoTime - clip.trimStart
    const timelineTime = clip.startTime + timeFromTrimStart
    
    currentTime.value = timelineTime
    
    // Check if we've reached the end of this clip
    if (videoTime >= currentVideoEndTime.value - 0.05) {
      advanceToNextClip()
    }
  }

  // ============================================================================
  // Clip Management
  // ============================================================================
  
  /**
   * Load the current clip's metadata into playback state
   */
  function loadCurrentClip() {
    const timelineClip = currentTimelineClip.value
    const sourceClip = currentSourceClip.value
    
    if (!timelineClip || !sourceClip) {
      console.error('[Playback] Cannot load clip: missing data')
      return
    }
    
    // Set loading flag to prevent UI jumps from stale timeupdate events
    isLoadingClip.value = true
    
    // Calculate where to start playing within the source video
    const timeInTimeline = currentTime.value - timelineClip.startTime
    const startTimeInSource = timelineClip.trimStart + Math.max(0, timeInTimeline)
    
    currentVideoSource.value = sourceClip.path
    currentVideoStartTime.value = startTimeInSource
    currentVideoEndTime.value = timelineClip.trimEnd
  }
  
  /**
   * Mark clip as ready (called by VideoPlayer after seek completes)
   */
  function markClipReady() {
    isLoadingClip.value = false
  }
  
  /**
   * Advance to the next clip in timeline
   */
  function advanceToNextClip() {
    const nextIndex = currentClipIndex.value + 1
    
    if (nextIndex >= timelineStore.clips.length) {
      // Reached end of timeline
      stop()
      return
    }
    
    // Move to next clip
    currentClipIndex.value = nextIndex
    const nextClip = timelineStore.clips[nextIndex]
    currentTime.value = nextClip.startTime
    
    loadCurrentClip()
  }
  
  /**
   * Find which clip contains a specific timeline time
   */
  function findClipIndexAtTime(time: number): number {
    return timelineStore.clips.findIndex(clip => 
      time >= clip.startTime && time < clip.startTime + clip.duration
    )
  }
  
  /**
   * Get clip that should be displayed at current time (for preview when paused)
   */
  function getClipAtTime(time: number) {
    const index = findClipIndexAtTime(time)
    
    if (index === -1) return null
    
    const timelineClip = timelineStore.clips[index]
    const sourceClip = clipStore.getClipById(timelineClip.clipId)
    
    if (!sourceClip) {
      console.error('[Playback] Source clip not found for clipId:', timelineClip.clipId)
      return null
    }
    
    const timeInTimeline = time - timelineClip.startTime
    const timeInSource = timelineClip.trimStart + timeInTimeline
    
    return {
      timelineClip,
      sourceClip,
      timeInSource
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================
  
  /**
   * Reset all playback state
   */
  function reset() {
    isPlaying.value = false
    currentTime.value = 0
    currentClipIndex.value = -1
    currentVideoSource.value = null
    currentVideoStartTime.value = 0
    currentVideoEndTime.value = 0
  }

  return {
    // State
    isPlaying,
    currentTime,
    currentClipIndex,
    currentVideoSource,
    currentVideoStartTime,
    currentVideoEndTime,
    isLoadingClip,
    
    // Computed
    currentTimelineClip,
    currentSourceClip,
    
    // Actions
    play,
    pause,
    togglePlayPause,
    stop,
    seekTo,
    updateTime,
    advanceToNextClip,
    getClipAtTime,
    reset,
    markClipReady,
  }
})

