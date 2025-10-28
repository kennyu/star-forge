import { defineStore } from 'pinia'
import { ref } from 'vue'

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

