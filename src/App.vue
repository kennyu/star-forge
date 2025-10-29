<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import FileImport from '@/components/FileImport.vue'
import MediaLibrary from '@/components/MediaLibrary.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import Timeline from '@/components/Timeline.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import RecordingDialog from '@/components/RecordingDialog.vue'
import { useClipStore } from '@/stores/clips'
import { useExportStore } from '@/stores/export'
import { useTimelineStore } from '@/stores/timeline'
import { useRecordingStore } from '@/stores/recording'

const clipStore = useClipStore()
const exportStore = useExportStore()
const timelineStore = useTimelineStore()
const recordingStore = useRecordingStore()
const hasClips = computed(() => clipStore.importedClips.length > 0)
const hasTimelineContent = computed(() => timelineStore.clips.length > 0)
const showExportDialog = ref(false)
const showRecordingDialog = ref(false)

const openExport = () => {
  // If export is running, show dialog to cancel
  if (exportStore.isExporting) {
    showExportDialog.value = true
  } else if (hasTimelineContent.value) {
    showExportDialog.value = true
  }
}

const openRecording = () => {
  showRecordingDialog.value = true
}

const dismissExportJob = () => {
  exportStore.resetExport()
}

const openOutputFolder = () => {
  if (exportStore.lastExportPath) {
    const { shell } = window.require('electron')
    shell.showItemInFolder(exportStore.lastExportPath)
  }
}

// Auto-dismiss success notification after 5 seconds
let autoDismissTimer: NodeJS.Timeout | null = null
watch([() => exportStore.exportProgress, () => exportStore.lastExportPath, () => exportStore.isExporting], ([progress, lastPath, isExporting]) => {
  // Clear any existing timer
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer)
    autoDismissTimer = null
  }
  
  // When export completes (100%, has output path, and not exporting), auto-dismiss after 5 seconds
  if (progress === 100 && lastPath && !isExporting) {
    console.log('[App] Export complete, starting 5s auto-dismiss timer')
    autoDismissTimer = setTimeout(() => {
      console.log('[App] Auto-dismissing export notification')
      exportStore.resetExport()
    }, 5000) // 5 seconds
  }
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- Header -->
        <header class="border-b">
          <div class="container flex h-16 items-center px-4">
            <h1 class="text-2xl font-bold">Star-Forge</h1>
            <div class="ml-auto flex items-center space-x-4">
              <!-- Recording Indicator -->
              <div v-if="recordingStore.isRecording" class="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-red-500">Recording</span>
                  <span class="text-xs font-mono text-red-400">{{ recordingStore.formattedElapsedTime }}</span>
                </div>
              </div>

              <!-- Export Job Progress Indicator -->
              <div v-if="exportStore.isExporting" class="flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                <div class="flex flex-col">
                  <span class="text-sm font-medium">{{ exportStore.exportJobName }}</span>
                  <span class="text-xs text-muted-foreground">{{ exportStore.exportProgress.toFixed(0) }}% complete</span>
                </div>
                <div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-primary transition-all duration-300"
                    :style="{ width: `${exportStore.exportProgress}%` }"
                  ></div>
                </div>
              </div>

              <!-- Export Completed Notification -->
              <div v-else-if="exportStore.exportProgress === 100 && exportStore.lastExportPath" class="flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-500">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
                <span class="text-sm font-medium text-green-500">Export Complete</span>
                <Button variant="link" size="sm" @click="openOutputFolder" class="h-auto p-0 text-xs">
                  Open
                </Button>
                <Button variant="ghost" size="icon" @click="dismissExportJob" class="h-6 w-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                  </svg>
                </Button>
              </div>

              <!-- Export Error Notification -->
              <div v-else-if="exportStore.exportError" class="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-500">
                  <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
                </svg>
                <span class="text-sm font-medium text-red-500">Export Failed</span>
                <Button variant="ghost" size="icon" @click="dismissExportJob" class="h-6 w-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                  </svg>
                </Button>
              </div>

              <Button @click="openRecording" variant="outline">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="mr-2">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Record
              </Button>
              <Button @click="openExport" :disabled="!hasTimelineContent">
                {{ exportStore.isExporting ? 'Cancel Export' : 'Export' }}
              </Button>
            </div>
          </div>
        </header>

    <!-- Main Content -->
    <main class="container mx-auto p-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left Column: File Import -->
        <div>
          <FileImport />
        </div>

        <!-- Right Column: Media Library -->
        <div>
          <MediaLibrary />
        </div>
      </div>

      <!-- Timeline -->
      <div v-if="hasClips" class="mt-6">
        <Timeline />
      </div>

      <!-- Video Preview -->
      <div v-if="hasClips" class="mt-6">
        <VideoPlayer />
      </div>
        </main>

        <!-- Export Dialog -->
        <ExportDialog :open="showExportDialog" @update:open="showExportDialog = $event" />
        
        <!-- Recording Dialog -->
        <RecordingDialog :open="showRecordingDialog" @update:open="showRecordingDialog = $event" />
      </div>
    </template>

<style>
/* Additional styles if needed */
</style>

