import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTimelineStore } from './timeline'

export interface Clip {
  id: string
  name: string
  path: string
  duration: number
  resolution: {
    width: number
    height: number
  }
  size: number
  type: string
  thumbnail?: string
}

export const useClipStore = defineStore('clips', () => {
  const importedClips = ref<Clip[]>([])
  const selectedClipId = ref<string | null>(null)

  function addClip(clip: Clip) {
    importedClips.value.push(clip)
  }

  function removeClip(id: string) {
    const index = importedClips.value.findIndex(clip => clip.id === id)
    if (index !== -1) {
      importedClips.value.splice(index, 1)
    }
    if (selectedClipId.value === id) {
      selectedClipId.value = null
    }

    // Remove all instances of this clip from timeline
    const timelineStore = useTimelineStore()
    
    // Find all timeline clips that reference this media clip
    const timelineClipIds = timelineStore.clips
      .filter(clip => clip.clipId === id)
      .map(clip => clip.id)
    
    // Remove each timeline clip
    for (const timelineClipId of timelineClipIds) {
      timelineStore.removeClipFromTimeline(timelineClipId)
    }
    
    // Auto-arrange remaining clips if any were removed
    if (timelineClipIds.length > 0) {
      timelineStore.reorderClips()
    }
  }

  function selectClip(id: string) {
    selectedClipId.value = id
  }

  function getClipById(id: string) {
    return importedClips.value.find(clip => clip.id === id)
  }

  function clearClips() {
    importedClips.value = []
    selectedClipId.value = null
  }

  return {
    importedClips,
    selectedClipId,
    addClip,
    removeClip,
    selectClip,
    getClipById,
    clearClips,
  }
})

