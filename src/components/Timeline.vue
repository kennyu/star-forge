<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useTimelineStore, type TimelineClip } from '@/stores/timeline'
import { useClipStore } from '@/stores/clips'
import { usePlaybackStore } from '@/stores/playback'

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
const pixelsPerSecond = computed(() => 100 * timelineStore.zoom)
const timelineWidth = computed(() => Math.max(1000, timelineStore.totalDuration * pixelsPerSecond.value))

// Timeline scrolling state
const timelineScrollLeft = ref(0)
const isDraggingTimeline = ref(false)
const dragStartX = ref(0)
const dragStartScrollLeft = ref(0)
const timelineContainerRef = ref<HTMLElement | null>(null)

// Timeline padding (half viewport width on each side)
const timelinePadding = computed(() => {
  if (!timelineContainerRef.value) return 0
  return timelineContainerRef.value.clientWidth / 2
})

// Generate thumbnail from video file
async function generateThumbnail(videoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!hiddenVideoRef.value || !hiddenCanvasRef.value) {
      reject(new Error('Video or canvas ref not available'))
      return
    }

    const video = hiddenVideoRef.value
    const canvas = hiddenCanvasRef.value
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Cannot get canvas context'))
      return
    }

    // Set up video
    video.src = `file://${videoPath}`
    video.muted = true

    const handleError = () => {
      reject(new Error('Failed to load video'))
    }

    const handleSeeked = () => {
      try {
        // Draw video frame to canvas at 120x68 resolution
        canvas.width = 120
        canvas.height = 68
        ctx.drawImage(video, 0, 0, 120, 68)
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        
        // Clean up
        video.removeEventListener('error', handleError)
        video.removeEventListener('seeked', handleSeeked)
        video.src = ''
        
        resolve(dataUrl)
      } catch (error) {
        reject(error)
      }
    }

    video.addEventListener('error', handleError)
    video.addEventListener('seeked', handleSeeked, { once: true })

    // Load and seek to 0.5 seconds
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0.5
    }, { once: true })

    video.load()
  })
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
    // Generate thumbnail
    const thumbnail = await generateThumbnail(clip.path)

    // Calculate position at the end of timeline
    const startTime = timelineStore.totalDuration

    // Create timeline clip
    const timelineClip: TimelineClip = {
      id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      clipId: clip.id,
      name: clip.name,
      startTime: startTime,
      duration: clip.duration,
      trimStart: 0,
      trimEnd: clip.duration,
      track: 0,
      thumbnail: thumbnail
    }

    timelineStore.addClipToTimeline(timelineClip)
    timelineStore.reorderClips() // Auto-arrange sequentially
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
  
  console.log('[Timeline] Playhead changed to:', newTime.toFixed(2))
  
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
  
  console.log('[Timeline] User scrolled, updating playhead to:', newTime.toFixed(2))
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
  // Don't seek if user was dragging (moved more than 5px)
  if (timelineDragDistance.value > 5) {
    timelineDragDistance.value = 0
    return
  }
  
  if (!timelineContainerRef.value) return
  
  const rect = timelineContainerRef.value.getBoundingClientRect()
  
  // Calculate absolute position in timeline (accounting for padding and scroll)
  const clickX = e.clientX - rect.left + timelineScrollLeft.value - timelinePadding.value
  
  // Convert to time
  const newTime = Math.max(0, clickX / pixelsPerSecond.value)
  
  console.log('[Timeline] Time ruler clicked at:', newTime.toFixed(2))
  
  // Seek to the clicked time
  playbackStore.seekTo(newTime)
  
  timelineDragDistance.value = 0
}

// Toggle timeline playback
const toggleTimelinePlayback = () => {
  console.log('[Timeline] toggleTimelinePlayback called')
  console.log('[Timeline] Current isPlaying:', playbackStore.isPlaying)
  console.log('[Timeline] Current playhead time:', playbackStore.currentTime)
  console.log('[Timeline] Timeline clips:', timelineStore.clips.length)
  
  playbackStore.togglePlayPause()
  
  console.log('[Timeline] After toggle, isPlaying:', playbackStore.isPlaying)
}

// Split clip at playhead
const splitClipAtPlayhead = async () => {
  const currentTime = playbackStore.currentTime
  
  // Find clip that contains the playhead
  const clipToSplit = timelineStore.clips.find(clip =>
    currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
  )
  
  if (!clipToSplit) {
    console.log('No clip at playhead position')
    return
  }
  
  // Calculate split position within the clip
  const splitTimeInClip = currentTime - clipToSplit.startTime
  
  // Can't split at the very start or end
  if (splitTimeInClip <= 0.1 || splitTimeInClip >= clipToSplit.duration - 0.1) {
    console.log('Cannot split at clip edges')
    return
  }
  
  // Get the source clip from media library
  const sourceClip = clipStore.getClipById(clipToSplit.clipId)
  if (!sourceClip) return
  
  // Create two new clips
  const clip1Duration = splitTimeInClip
  const clip2Duration = clipToSplit.duration - splitTimeInClip
  
  const clip1: TimelineClip = {
    id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    clipId: clipToSplit.clipId,
    name: `${clipToSplit.name} (1)`,
    startTime: clipToSplit.startTime,
    duration: clip1Duration,
    trimStart: clipToSplit.trimStart,
    trimEnd: clipToSplit.trimStart + clip1Duration,
    track: clipToSplit.track,
    thumbnail: clipToSplit.thumbnail
  }
  
  const clip2: TimelineClip = {
    id: `timeline-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
    clipId: clipToSplit.clipId,
    name: `${clipToSplit.name} (2)`,
    startTime: clipToSplit.startTime + clip1Duration,
    duration: clip2Duration,
    trimStart: clipToSplit.trimStart + clip1Duration,
    trimEnd: clipToSplit.trimEnd,
    track: clipToSplit.track,
    thumbnail: clipToSplit.thumbnail
  }
  
  // Remove original clip
  timelineStore.removeClipFromTimeline(clipToSplit.id)
  
  // Add two new clips
  timelineStore.addClipToTimeline(clip1)
  timelineStore.addClipToTimeline(clip2)
  
  // Reorder to maintain sequence
  timelineStore.reorderClips()
  
  console.log(`Split clip at ${splitTimeInClip.toFixed(2)}s`)
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
          @mousemove="handleTimelineDragMove"
          @mouseup="handleTimelineDragEnd"
          @mouseleave="handleTimelineDragEnd"
          @scroll="handleTimelineScroll"
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
              <!-- Time markers every 5 seconds -->
              <div
                v-for="i in Math.ceil(timelineStore.totalDuration / 5)"
                :key="i"
                :style="{ left: `${i * 5 * pixelsPerSecond}px` }"
                class="absolute top-0 bottom-0 border-l border-border"
              >
                <span class="text-xs text-muted-foreground ml-1">{{ formatTime(i * 5) }}</span>
              </div>
            </div>
          </div>

          <!-- Clips Track -->
          <div class="relative h-20" @click="handleTimelineClick">
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
              <!-- Thumbnail -->
              <div
                class="absolute inset-0 bg-cover bg-center"
                :style="{ backgroundImage: `url(${clip.thumbnail})` }"
              ></div>
              
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


