import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TimelineClip {
  id: string
  clipId: string // Reference to clip in ClipStore
  name: string // Clip name for display
  startTime: number // Position on timeline in seconds
  duration: number
  trimStart: number // Where to start playing from (in seconds)
  trimEnd: number // Where to stop playing (in seconds)
  track: number // For multi-track support later
  thumbnail: string // Data URL of thumbnail image
}

export const useTimelineStore = defineStore('timeline', () => {
  const clips = ref<TimelineClip[]>([])
  const playheadTime = ref(0)
  const zoom = ref(1)
  const isPlaying = ref(false)
  const selectedTimelineClipId = ref<string | null>(null)

  const totalDuration = computed(() => {
    if (clips.value.length === 0) return 0
    return clips.value.reduce((max, clip) => {
      const clipEnd = clip.startTime + clip.duration
      return Math.max(max, clipEnd)
    }, 0)
  })

  function addClipToTimeline(timelineClip: TimelineClip) {
    clips.value.push(timelineClip)
    sortClipsByStartTime()
  }

  function removeClipFromTimeline(id: string) {
    const index = clips.value.findIndex(clip => clip.id === id)
    if (index !== -1) {
      clips.value.splice(index, 1)
    }
  }

  function updateClip(id: string, updates: Partial<TimelineClip>) {
    const clip = clips.value.find(c => c.id === id)
    if (clip) {
      Object.assign(clip, updates)
      sortClipsByStartTime()
    }
  }

  function sortClipsByStartTime() {
    clips.value.sort((a, b) => a.startTime - b.startTime)
  }

  function moveClip(clipId: string, newStartTime: number) {
    const clip = clips.value.find(c => c.id === clipId)
    if (clip) {
      clip.startTime = Math.max(0, newStartTime)
      sortClipsByStartTime()
    }
  }

  function getClipAtTime(time: number): TimelineClip | null {
    return clips.value.find(clip => 
      time >= clip.startTime && time < clip.startTime + clip.duration
    ) || null
  }

  function setPlayhead(time: number) {
    playheadTime.value = Math.max(0, Math.min(time, totalDuration.value))
  }

  function setZoom(level: number) {
    zoom.value = Math.max(0.1, Math.min(level, 5))
  }

  function play() {
    isPlaying.value = true
  }

  function pause() {
    isPlaying.value = false
  }

  function clearTimeline() {
    clips.value = []
    playheadTime.value = 0
    selectedTimelineClipId.value = null
  }

  function selectTimelineClip(clipId: string | null) {
    selectedTimelineClipId.value = clipId
  }

  function reorderClips() {
    // Rearrange clips to be sequential with no gaps
    let currentTime = 0
    sortClipsByStartTime()
    clips.value.forEach(clip => {
      clip.startTime = currentTime
      currentTime += clip.duration
    })
  }

  return {
    clips,
    playheadTime,
    zoom,
    isPlaying,
    selectedTimelineClipId,
    totalDuration,
    addClipToTimeline,
    removeClipFromTimeline,
    updateClip,
    moveClip,
    getClipAtTime,
    setPlayhead,
    setZoom,
    play,
    pause,
    clearTimeline,
    selectTimelineClip,
    reorderClips,
  }
})

