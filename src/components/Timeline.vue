<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useTimelineStore, type TimelineClip } from '@/stores/timeline'
import { useClipStore } from '@/stores/clips'
import { usePlaybackStore } from '@/stores/playback'

// Constants
const THUMBNAIL_WIDTH = 160
const THUMBNAIL_HEIGHT = 90
const THUMBNAIL_INTERVAL = 0.25 // seconds between thumbnails
const PIXELS_PER_SECOND_BASE = 100
const TIME_MARKER_INTERVAL = 5 // seconds
const MIN_SPLIT_DISTANCE = 0.1 // seconds from edge
const DRAG_THRESHOLD = 5 // pixels

const timelineStore = useTimelineStore()
const clipStore = useClipStore()
const playbackStore = usePlaybackStore()

// Refs for thumbnail generation
const hiddenVideoRef = ref<HTMLVideoElement | null>(null)
const hiddenCanvasRef = ref<HTMLCanvasElement | null>(null)

// UI state
const isDraggingOver = ref(false)
const isDraggingClip = ref(false)
const draggedClipId = ref<string | null>(null)
const dropTargetIndex = ref<number | null>(null)
const pixelsPerSecond = computed(() => PIXELS_PER_SECOND_BASE * timelineStore.zoom)
const timelineWidth = computed(() => Math.max(1000, timelineStore.totalDuration * pixelsPerSecond.value))

// Timeline scrolling state
const timelineScrollLeft = ref(0)
const isDraggingTimeline = ref(false)
const dragStartX = ref(0)
const dragStartScrollLeft = ref(0)
const timelineContainerRef = ref<HTMLElement | null>(null)

// Hover thumbnail preview state
const isHoveringTimeline = ref(false)
const hoverTime = ref(0)
const hoverThumbnail = ref<string | null>(null)
const hoverX = ref(0)
const hoverY = ref(0)

// Timeline padding (half viewport width on each side)
const timelinePadding = computed(() => {
  if (!timelineContainerRef.value) return 0
  return timelineContainerRef.value.clientWidth / 2
})

// Generate a filmstrip of thumbnails from a video file
async function generateThumbnails(
  videoPath: string, 
  duration: number,
  onProgress?: (thumbnail: string, index: number, thumbnails: string[]) => void
): Promise<string[]> {
  if (!hiddenVideoRef.value || !hiddenCanvasRef.value) {
    throw new Error('Video or canvas ref not available')
  }

  const video = hiddenVideoRef.value
  const canvas = hiddenCanvasRef.value
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Cannot get canvas context')
  }

  // Use a consistent thumbnail resolution
  canvas.width = THUMBNAIL_WIDTH
  canvas.height = THUMBNAIL_HEIGHT

  // Helper to load metadata
  const waitForMetadata = () => new Promise<void>((resolve, reject) => {
    const handleLoaded = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('Failed to load video metadata'))
    }
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoaded)
      video.removeEventListener('error', handleError)
    }

    video.addEventListener('loadedmetadata', handleLoaded)
    video.addEventListener('error', handleError)
    video.load()
  })

  // Determine an initial duration guess until metadata is available
  let actualDuration = Number.isFinite(duration) && duration > 0 ? duration : 1

  // Helper to seek to a given time and capture the frame
  const captureFrame = async (time: number, thumbnails: string[]) => {
    await new Promise<void>((resolve, reject) => {
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)

        try {
          ctx.drawImage(video, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
          thumbnails.push(canvas.toDataURL('image/jpeg', 0.7))
          resolve()
        } catch (frameError) {
          reject(frameError)
        }
      }

      const handleError = () => {
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)
        reject(new Error('Failed to capture frame from video'))
      }

      video.addEventListener('seeked', handleSeeked, { once: true })
      video.addEventListener('error', handleError, { once: true })

      const clampedDuration = Number.isFinite(actualDuration) && actualDuration > 0
        ? actualDuration
        : Math.max(duration, 0.1)
      const safeTime = Math.min(Math.max(time, 0), Math.max(clampedDuration - 0.05, 0))
      video.currentTime = safeTime
    })
  }

  const cleanupVideo = () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }

  video.src = `file://${videoPath}`
  video.muted = true

  const thumbnails: string[] = []

  try {
    await waitForMetadata()

    const metadataDuration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : null
    actualDuration = metadataDuration ?? (Number.isFinite(duration) && duration > 0 ? duration : 1)

    // Determine how many frames to capture based on clip length
    const frameCount = Math.max(1, Math.round(actualDuration / THUMBNAIL_INTERVAL))
    const segmentLength = actualDuration / frameCount

    for (let i = 0; i < frameCount; i++) {
      const targetTime = frameCount === 1
        ? actualDuration / 2
        : segmentLength * i + segmentLength / 2

      try {
        await captureFrame(targetTime, thumbnails)
        
        // Call progress callback after each thumbnail is captured
        if (onProgress && thumbnails.length > 0) {
          onProgress(thumbnails[thumbnails.length - 1], i, [...thumbnails])
        }
      } catch (frameError) {
        console.warn('[Timeline] Failed to capture thumbnail frame:', frameError)

        // Attempt a single fallback frame if nothing has been captured yet
        if (thumbnails.length === 0 && i === 0) {
          try {
            await captureFrame(0.1, thumbnails)
            
            // Call progress callback for fallback frame too
            if (onProgress && thumbnails.length > 0) {
              onProgress(thumbnails[thumbnails.length - 1], 0, [...thumbnails])
            }
          } catch (fallbackError) {
            console.error('[Timeline] Fallback thumbnail capture failed:', fallbackError)
            break
          }
        } else {
          break
        }
      }
    }
  } finally {
    cleanupVideo()
  }

  return thumbnails
}

// Helper: Generate unique clip ID
const generateClipId = () => `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Helper: Split thumbnail frames proportionally
const splitThumbnailFrames = (
  originalFrames: string[], 
  splitRatio: number
): [string[], string[]] => {
  if (originalFrames.length === 0) return [[], []]
  
  const totalFrames = originalFrames.length
  let clip1Count = Math.max(1, Math.round(totalFrames * splitRatio))
  clip1Count = Math.min(clip1Count, totalFrames)
  
  let clip2Count = totalFrames - clip1Count
  
  // Ensure both clips have at least one frame if possible
  if (clip2Count === 0 && totalFrames > 1) {
    clip2Count = 1
    clip1Count = totalFrames - 1
  }
  
  let clip1Frames = originalFrames.slice(0, clip1Count)
  let clip2Frames = originalFrames.slice(clip1Count)
  
  // Fallback: ensure both have at least one frame
  if (clip1Frames.length === 0 && clip2Frames.length > 0) {
    clip1Frames = [clip2Frames[0]]
  }
  if (clip2Frames.length === 0 && clip1Frames.length > 0) {
    clip2Frames = [clip1Frames[clip1Frames.length - 1]]
  }
  
  return [clip1Frames, clip2Frames]
}

// Handle drag and drop from media library
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  
  // Only show drop zone highlight for media library drags, not timeline clip drags
  const timelineClipId = e.dataTransfer?.types.includes('timelineclipid')
  if (!timelineClipId) {
    isDraggingOver.value = true
  }
}

const handleDragLeave = () => {
  isDraggingOver.value = false
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  isDraggingOver.value = false

  // Ignore if dragging timeline clip (handled by handleClipDrop)
  const timelineClipId = e.dataTransfer?.getData('timelineClipId')
  if (timelineClipId) return

  const clipId = e.dataTransfer?.getData('clipId')
  if (!clipId) return

  const clip = clipStore.getClipById(clipId)
  if (!clip) return

  try {
    // Validate clip duration
    if (!clip.duration || clip.duration <= 0 || !isFinite(clip.duration)) {
      console.error('[Timeline] Cannot add clip with invalid duration:', clip.duration)
      alert('Cannot add this clip to timeline: Invalid or missing duration. Please ensure the video file has valid metadata.')
      return
    }

    // Calculate position at the end of timeline
    const startTime = timelineStore.totalDuration
    const newClipId = generateClipId()

    // Create timeline clip IMMEDIATELY with placeholder
    const timelineClip: TimelineClip = {
      id: newClipId,
      clipId: clip.id,
      name: clip.name,
      startTime: startTime,
      duration: clip.duration,
      trimStart: 0,
      trimEnd: clip.duration,
      track: 0,
      thumbnail: '',
      thumbnailFrames: [],
      isLoadingThumbnails: true
    }

    // Add to timeline immediately for instant feedback
    timelineStore.addClipToTimeline(timelineClip)
    timelineStore.reorderClips()

    // Generate thumbnails with progress callback
    try {
      await generateThumbnails(
        clip.path, 
        clip.duration,
        // Progress callback - updates clip as each thumbnail is generated
        (thumbnail, index, allThumbnails) => {
          const updates: Partial<TimelineClip> = {
            thumbnailFrames: allThumbnails
          }
          // Set primary thumbnail on first frame
          if (index === 0) {
            updates.thumbnail = thumbnail
          }
          timelineStore.updateClip(newClipId, updates)
        }
      )
      
      // Mark loading as complete
      timelineStore.updateClip(newClipId, { isLoadingThumbnails: false })
      
    } catch (thumbError) {
      console.error('[Timeline] Failed to generate thumbnails for clip:', thumbError)
      // Mark as done even if failed
      timelineStore.updateClip(newClipId, { isLoadingThumbnails: false })
    }

  } catch (error) {
    console.error('Failed to add clip to timeline:', error)
  }
}

// Select clip on timeline
const selectClip = (clipId: string, e: MouseEvent) => {
  e.stopPropagation()
  timelineStore.selectTimelineClip(clipId)
}

// Remove clip from timeline
const removeClip = (clipId: string, e: MouseEvent) => {
  e.stopPropagation()
  timelineStore.removeClipFromTimeline(clipId)
  timelineStore.reorderClips()
}

// Drag to reorder clips within timeline
const handleClipDragStart = (e: DragEvent, clipId: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('timelineClipId', clipId)
    draggedClipId.value = clipId
    isDraggingClip.value = true
  }
}

const handleClipDragEnd = () => {
  isDraggingClip.value = false
  draggedClipId.value = null
  dropTargetIndex.value = null
}

const handleClipDragOver = (e: DragEvent, targetClipId: string) => {
  e.preventDefault()
  e.stopPropagation()
  
  // Check if we're dragging a timeline clip (not a media library clip)
  const hasTimelineClipId = e.dataTransfer?.types.includes('timelineclipid')
  if (!hasTimelineClipId) return
  
  const targetIndex = timelineStore.clips.findIndex(c => c.id === targetClipId)
  dropTargetIndex.value = targetIndex
}

const handleClipDrop = (e: DragEvent, targetClipId: string) => {
  e.preventDefault()
  e.stopPropagation()
  
  const draggedId = e.dataTransfer?.getData('timelineClipId')
  if (!draggedId || draggedId === targetClipId) {
    handleClipDragEnd()
    return
  }
  
  // Find the clips
  const draggedClip = timelineStore.clips.find(c => c.id === draggedId)
  const targetClip = timelineStore.clips.find(c => c.id === targetClipId)
  
  if (!draggedClip || !targetClip) {
    handleClipDragEnd()
    return
  }
  
  // Get the target's current startTime to swap positions
  const targetStartTime = targetClip.startTime
  const draggedStartTime = draggedClip.startTime
  
  // Swap the start times to reorder
  draggedClip.startTime = targetStartTime
  targetClip.startTime = draggedStartTime
  
  // Auto-arrange sequentially
  timelineStore.reorderClips()
  
  handleClipDragEnd()
}

// Format time for display
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Zoom controls
const handleZoomChange = (value: number) => {
  timelineStore.setZoom(value)
}

// Calculate position for clip on timeline
const getClipStyle = (clip: TimelineClip) => {
  return {
    left: `${clip.startTime * pixelsPerSecond.value}px`,
    width: `${clip.duration * pixelsPerSecond.value}px`,
  }
}

// Sync scroll position to playhead time from playback store
watch(() => playbackStore.currentTime, (newTime) => {
  if (!timelineContainerRef.value) return
  
  // Calculate scroll position to center the playhead at this time
  const containerWidth = timelineContainerRef.value.clientWidth
  const timePosition = newTime * pixelsPerSecond.value
  const newScrollLeft = Math.max(0, timePosition + timelinePadding.value - (containerWidth / 2))
  
  // Scroll to position (smooth when not playing, instant when playing)
  timelineContainerRef.value.scrollTo({
    left: newScrollLeft,
    behavior: playbackStore.isPlaying ? 'auto' : 'smooth'
  })
  
  timelineScrollLeft.value = newScrollLeft
})

// Update playhead time when user manually scrolls (only when NOT playing)
const updatePlayheadFromScroll = () => {
  if (playbackStore.isPlaying || !timelineContainerRef.value) return
  
  const containerWidth = timelineContainerRef.value.clientWidth
  const centerPosition = timelineScrollLeft.value + (containerWidth / 2) - timelinePadding.value
  const newTime = Math.max(0, centerPosition / pixelsPerSecond.value)
  
  playbackStore.seekTo(newTime)
}

// Drag to scroll timeline
const timelineDragDistance = ref(0)

const handleTimelineDragStart = (e: MouseEvent) => {
  // Only drag if not dragging a clip
  if ((e.target as HTMLElement).closest('[draggable="true"]')) return
  
  isDraggingTimeline.value = true
  dragStartX.value = e.clientX
  dragStartScrollLeft.value = timelineScrollLeft.value
  timelineDragDistance.value = 0
  
  // Prevent text selection while dragging
  e.preventDefault()
}

const handleTimelineDragMove = (e: MouseEvent) => {
  if (!isDraggingTimeline.value) return
  
  const deltaX = dragStartX.value - e.clientX
  timelineDragDistance.value = Math.abs(deltaX)
  
  const newScrollLeft = Math.max(0, dragStartScrollLeft.value + deltaX)
  
  timelineScrollLeft.value = newScrollLeft
  
  // Update actual scroll
  if (timelineContainerRef.value) {
    timelineContainerRef.value.scrollLeft = newScrollLeft
  }
}

const handleTimelineDragEnd = () => {
  isDraggingTimeline.value = false
  // Update playhead from final scroll position
  updatePlayheadFromScroll()
}

// Track scroll position
const handleTimelineScroll = (e: Event) => {
  const target = e.target as HTMLElement
  timelineScrollLeft.value = target.scrollLeft
}

// Click on timeline to deselect clips
const handleTimelineClick = () => {
  // Only deselect if clicking empty space (not dragging)
  if (!isDraggingTimeline.value) {
    timelineStore.selectTimelineClip(null)
  }
}

// Click on time ruler to seek
const handleTimeRulerClick = (e: MouseEvent) => {
  // Don't seek if user was dragging
  if (timelineDragDistance.value > DRAG_THRESHOLD) {
    timelineDragDistance.value = 0
    return
  }
  
  if (!timelineContainerRef.value) return
  
  const rect = timelineContainerRef.value.getBoundingClientRect()
  const clickX = e.clientX - rect.left + timelineScrollLeft.value - timelinePadding.value
  const newTime = Math.max(0, clickX / pixelsPerSecond.value)
  
  playbackStore.seekTo(newTime)
  timelineDragDistance.value = 0
}

// Handle hover thumbnail preview
const handleTimelineHover = (e: MouseEvent) => {
  if (!timelineContainerRef.value) return
  
  const rect = timelineContainerRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left + timelineScrollLeft.value - timelinePadding.value
  const time = Math.max(0, mouseX / pixelsPerSecond.value)
  
  hoverTime.value = time
  hoverX.value = e.clientX
  hoverY.value = rect.top
  
  // Find clip at this time
  const clip = timelineStore.clips.find(c => 
    time >= c.startTime && time < c.startTime + c.duration
  )
  
  if (clip && clip.thumbnailFrames && clip.thumbnailFrames.length > 0) {
    // Calculate relative position within clip
    const timeInClip = time - clip.startTime
    const progress = timeInClip / clip.duration
    const frameIndex = Math.floor(progress * clip.thumbnailFrames.length)
    const clampedIndex = Math.min(frameIndex, clip.thumbnailFrames.length - 1)
    
    hoverThumbnail.value = clip.thumbnailFrames[clampedIndex]
  } else {
    hoverThumbnail.value = null
  }
}

const handleTimelineMouseEnter = () => {
  isHoveringTimeline.value = true
}

const handleTimelineMouseLeave = () => {
  isHoveringTimeline.value = false
  hoverThumbnail.value = null
}

// Toggle timeline playback
const toggleTimelinePlayback = () => {
  playbackStore.togglePlayPause()
}

// Split clip at playhead
const splitClipAtPlayhead = () => {
  const currentTime = playbackStore.currentTime
  
  // Find clip that contains the playhead
  const clipToSplit = timelineStore.clips.find(clip =>
    currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
  )
  
  if (!clipToSplit) {
    console.warn('[Timeline] No clip at playhead position')
    return
  }
  
  // Calculate split position within the clip
  const splitTimeInClip = currentTime - clipToSplit.startTime
  
  // Can't split at the very start or end
  if (splitTimeInClip <= MIN_SPLIT_DISTANCE || splitTimeInClip >= clipToSplit.duration - MIN_SPLIT_DISTANCE) {
    console.warn('[Timeline] Cannot split at clip edges')
    return
  }
  
  const clip1Duration = splitTimeInClip
  const clip2Duration = clipToSplit.duration - splitTimeInClip
  const splitRatio = clip1Duration / clipToSplit.duration

  // Split thumbnails proportionally
  const [clip1Frames, clip2Frames] = splitThumbnailFrames(
    clipToSplit.thumbnailFrames ?? [], 
    splitRatio
  )
  
  const clip1Thumbnail = clip1Frames[0] ?? clipToSplit.thumbnail
  const clip2Thumbnail = clip2Frames[0] ?? clipToSplit.thumbnail

  const clip1: TimelineClip = {
    id: generateClipId(),
    clipId: clipToSplit.clipId,
    name: `${clipToSplit.name} (1)`,
    startTime: clipToSplit.startTime,
    duration: clip1Duration,
    trimStart: clipToSplit.trimStart,
    trimEnd: clipToSplit.trimStart + clip1Duration,
    track: clipToSplit.track,
    thumbnail: clip1Thumbnail,
    thumbnailFrames: clip1Frames.length > 0 ? clip1Frames : undefined
  }

  const clip2: TimelineClip = {
    id: generateClipId(),
    clipId: clipToSplit.clipId,
    name: `${clipToSplit.name} (2)`,
    startTime: clipToSplit.startTime + clip1Duration,
    duration: clip2Duration,
    trimStart: clipToSplit.trimStart + clip1Duration,
    trimEnd: clipToSplit.trimEnd,
    track: clipToSplit.track,
    thumbnail: clip2Thumbnail,
    thumbnailFrames: clip2Frames.length > 0 ? clip2Frames : undefined
  }
  
  // Remove original and add split clips
  timelineStore.removeClipFromTimeline(clipToSplit.id)
  timelineStore.addClipToTimeline(clip1)
  timelineStore.addClipToTimeline(clip2)
  timelineStore.reorderClips()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">Timeline</h2>
      <div class="flex items-center gap-4">
        <!-- Play/Pause Button -->
        <Button 
          @click="toggleTimelinePlayback"
          variant="default"
          size="sm"
          :disabled="timelineStore.clips.length === 0"
        >
          <svg
            v-if="!playbackStore.isPlaying"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="mr-2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="mr-2"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          {{ playbackStore.isPlaying ? 'Pause' : 'Play' }}
        </Button>

        <Button 
          @click="splitClipAtPlayhead"
          variant="outline"
          size="sm"
          :disabled="timelineStore.clips.length === 0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="mr-2"
          >
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          Split Clip
        </Button>
        <span class="text-sm text-muted-foreground">Zoom:</span>
        <Slider
          :model-value="timelineStore.zoom"
          :min="0.5"
          :max="3"
          :step="0.1"
          @update:model-value="handleZoomChange"
          class="w-32"
        />
        <span class="text-sm font-mono">{{ formatTime(timelineStore.totalDuration) }}</span>
      </div>
    </div>

    <!-- Drop Zone -->
    <div
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      :class="[
        'relative rounded-lg border-2 bg-card overflow-hidden',
        isDraggingOver ? 'border-primary bg-primary/5' : 'border-border',
        timelineStore.clips.length === 0 ? 'min-h-[200px]' : 'min-h-[120px]'
      ]"
    >
      <!-- Empty State -->
      <div
        v-if="timelineStore.clips.length === 0"
        class="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none"
      >
        <div class="text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="mx-auto mb-2"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <p class="text-lg font-medium">Drag clips here to build your timeline</p>
          <p class="text-sm mt-1">Clips will be arranged sequentially</p>
        </div>
      </div>

      <!-- Timeline Content Wrapper with Playhead -->
      <div 
        v-if="timelineStore.clips.length > 0"
        class="relative"
      >
        <!-- Hover Thumbnail Preview -->
        <div
          v-if="isHoveringTimeline && hoverThumbnail"
          class="fixed pointer-events-none z-[100]"
          :style="{
            left: `${hoverX}px`,
            top: `${hoverY - 180}px`,
            transform: 'translateX(-50%)'
          }"
        >
          <div class="relative bg-black rounded-lg overflow-hidden shadow-2xl border-2 border-white/20">
            <img 
              :src="hoverThumbnail"
              class="w-40 h-40 block object-cover"
              alt="Preview"
            />
            <div class="absolute bottom-0 inset-x-0 bg-black/90 text-white text-xs px-2 py-1 text-center font-mono">
              {{ formatTime(hoverTime) }}
            </div>
          </div>
          <!-- Small arrow pointing down -->
          <div class="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white/20"></div>
        </div>

        <!-- Fixed Playhead Indicator -->
        <div 
          class="absolute top-0 bottom-0 left-1/2 w-0.5 z-50 pointer-events-none transition-colors"
          :class="playbackStore.isPlaying ? 'bg-green-500' : 'bg-red-500'"
          style="transform: translateX(-50%);"
        >
          <div 
            class="absolute -top-1 -left-1.5 w-3 h-3 rounded-full transition-colors"
            :class="playbackStore.isPlaying ? 'bg-green-500' : 'bg-red-500'"
          ></div>
          <div 
            class="absolute top-8 left-1/2 -translate-x-1/2 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-auto transition-colors"
            :class="playbackStore.isPlaying ? 'bg-green-500' : 'bg-red-500'"
          >
            {{ formatTime(playbackStore.currentTime) }}
          </div>
        </div>

        <!-- Timeline Scrollable Content -->
        <div 
          ref="timelineContainerRef"
          class="relative overflow-x-auto cursor-grab active:cursor-grabbing"
          @mousedown="handleTimelineDragStart"
          @mousemove="(e) => { handleTimelineDragMove(e); handleTimelineHover(e); }"
          @mouseup="handleTimelineDragEnd"
          @mouseleave="() => { handleTimelineDragEnd(); handleTimelineMouseLeave(); }"
          @scroll="handleTimelineScroll"
          @mouseenter="handleTimelineMouseEnter"
        >
        <div 
          :style="{ 
            width: `${timelineWidth + timelinePadding * 2}px`,
            paddingLeft: `${timelinePadding}px`,
            paddingRight: `${timelinePadding}px`
          }"
        >
          <!-- Time Ruler -->
          <div 
            class="h-8 bg-muted/30 border-b flex items-center px-2 cursor-pointer hover:bg-muted/40 transition-colors"
            @click="handleTimeRulerClick"
          >
            <div class="relative" :style="{ width: `${timelineWidth}px`, height: '100%' }">
              <!-- Time markers -->
              <div
                v-for="i in Math.max(0, Math.min(1000, Math.ceil(timelineStore.totalDuration / TIME_MARKER_INTERVAL)))"
                :key="i"
                :style="{ left: `${i * TIME_MARKER_INTERVAL * pixelsPerSecond}px` }"
                class="absolute top-0 bottom-0 border-l border-border"
              >
                <span class="text-xs text-muted-foreground ml-1">{{ formatTime(i * TIME_MARKER_INTERVAL) }}</span>
              </div>
            </div>
          </div>

          <!-- Clips Track -->
          <div 
            class="relative h-20" 
            @click="handleTimelineClick"
          >
            <div :style="{ width: `${timelineWidth}px`, height: '100%' }" class="relative">
            <!-- Timeline Clips -->
            <div
              v-for="(clip, index) in timelineStore.clips"
              :key="clip.id"
              draggable="true"
              @dragstart="handleClipDragStart($event, clip.id)"
              @dragend="handleClipDragEnd"
              @dragover="handleClipDragOver($event, clip.id)"
              @drop="handleClipDrop($event, clip.id)"
              @click="selectClip(clip.id, $event)"
              :style="getClipStyle(clip)"
              :class="[
                'absolute top-2 h-16 rounded border-2 bg-background overflow-hidden group cursor-move transition-all',
                timelineStore.selectedTimelineClipId === clip.id 
                  ? 'border-primary ring-2 ring-primary/50' 
                  : 'border-muted-foreground/30 hover:border-primary/80',
                isDraggingClip && draggedClipId === clip.id ? 'opacity-50' : '',
                dropTargetIndex === index ? 'ring-2 ring-blue-500' : ''
              ]"
            >
              <!-- Thumbnail filmstrip -->
              <div class="absolute inset-0 overflow-hidden">
                <!-- Loading State: Show while thumbnails are being generated -->
                <div
                  v-if="clip.isLoadingThumbnails && (!clip.thumbnailFrames || clip.thumbnailFrames.length === 0)"
                  class="h-full w-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center"
                >
                  <div class="text-center">
                    <div class="animate-pulse text-white/60 mb-2">
                      <svg class="w-8 h-8 mx-auto animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    <span class="text-xs text-white/60">Loading thumbnails...</span>
                  </div>
                </div>
                
                <!-- Thumbnail filmstrip: Shows thumbnails as they load -->
                <div
                  v-else-if="clip.thumbnailFrames && clip.thumbnailFrames.length > 0"
                  class="grid h-full w-full"
                  :style="{ gridTemplateColumns: `repeat(${clip.thumbnailFrames.length}, minmax(0, 1fr))` }"
                >
                  <div
                    v-for="(frame, frameIndex) in clip.thumbnailFrames"
                    :key="frameIndex"
                    class="relative h-full w-full"
                  >
                    <img
                      :src="frame"
                      alt=""
                      class="h-full w-full object-cover select-none pointer-events-none"
                      draggable="false"
                    />
                    <div
                      v-if="frameIndex < clip.thumbnailFrames.length - 1"
                      class="absolute top-0 right-0 h-full w-px bg-black/30"
                    ></div>
                  </div>
                </div>
                
                <!-- Fallback: Show single thumbnail or empty state -->
                <div
                  v-else
                  class="h-full w-full bg-cover bg-center bg-gray-700"
                  :style="clip.thumbnail ? { backgroundImage: `url(${clip.thumbnail})` } : {}"
                ></div>
              </div>
              
              <!-- Overlay with clip info -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-2">
                <p class="text-xs text-white font-medium truncate">{{ clip.name }}</p>
                <p class="text-xs text-white/70">{{ formatTime(clip.duration) }}</p>
              </div>

              <!-- Remove button -->
              <Button
                @click="removeClip(clip.id, $event)"
                variant="ghost"
                size="icon"
                class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-all bg-red-500/80 text-white border border-white/20 shadow-lg hover:bg-red-600 hover:scale-110"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
    </div>
    </div>

    <!-- Hidden elements for thumbnail generation -->
    <video ref="hiddenVideoRef" class="hidden"></video>
    <canvas ref="hiddenCanvasRef" class="hidden"></canvas>
  </div>
</template>

<style scoped>
/* Custom scrollbar for timeline */
.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: hsl(var(--muted));
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground));
  border-radius: 4px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--foreground));
}
</style>


