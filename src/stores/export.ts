import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ExportSettings {
  quality: '720p' | '1080p' | 'source'
  fps: number
  format: 'mp4'
}

export const useExportStore = defineStore('export', () => {
  const isExporting = ref(false)
  const exportProgress = ref(0)
  const exportError = ref<string | null>(null)
  const lastExportPath = ref<string | null>(null)

  const settings = ref<ExportSettings>({
    quality: '1080p',
    fps: 30,
    format: 'mp4',
  })

  function startExport() {
    isExporting.value = true
    exportProgress.value = 0
    exportError.value = null
  }

  function updateProgress(progress: number) {
    exportProgress.value = Math.max(0, Math.min(progress, 100))
  }

  function completeExport(outputPath: string) {
    isExporting.value = false
    exportProgress.value = 100
    lastExportPath.value = outputPath
  }

  function failExport(error: string) {
    isExporting.value = false
    exportError.value = error
  }

  function resetExport() {
    isExporting.value = false
    exportProgress.value = 0
    exportError.value = null
  }

  function updateSettings(newSettings: Partial<ExportSettings>) {
    settings.value = { ...settings.value, ...newSettings }
  }

  return {
    isExporting,
    exportProgress,
    exportError,
    lastExportPath,
    settings,
    startExport,
    updateProgress,
    completeExport,
    failExport,
    resetExport,
    updateSettings,
  }
})

