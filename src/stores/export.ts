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
  const exportJobName = ref<string>('')
  const isBackgroundExport = ref(false)

  const settings = ref<ExportSettings>({
    quality: '1080p',
    fps: 30,
    format: 'mp4',
  })

  function startExport(jobName: string = 'Export', background: boolean = false) {
    isExporting.value = true
    exportProgress.value = 0
    exportError.value = null
    exportJobName.value = jobName
    isBackgroundExport.value = background
    lastExportPath.value = null
  }

  function updateProgress(progress: number) {
    exportProgress.value = Math.max(0, Math.min(progress, 100))
  }

  function completeExport(outputPath: string) {
    isExporting.value = false
    lastExportPath.value = outputPath
    exportProgress.value = 100
  }

  function failExport(error: string) {
    isExporting.value = false
    exportError.value = error
    isBackgroundExport.value = false
  }

  function resetExport() {
    isExporting.value = false
    exportProgress.value = 0
    exportError.value = null
    lastExportPath.value = null
    exportJobName.value = ''
    isBackgroundExport.value = false
  }

  function cancelExport() {
    isExporting.value = false
    exportProgress.value = 0
    exportError.value = 'Export cancelled by user'
    isBackgroundExport.value = false
  }

  function updateSettings(newSettings: Partial<ExportSettings>) {
    settings.value = { ...settings.value, ...newSettings }
  }

  return {
    isExporting,
    exportProgress,
    exportError,
    lastExportPath,
    exportJobName,
    isBackgroundExport,
    settings,
    startExport,
    updateProgress,
    completeExport,
    failExport,
    resetExport,
    cancelExport,
    updateSettings,
  }
})

