<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useClipStore } from '@/stores/clips'
import { useExportStore } from '@/stores/export'
import { useTimelineStore } from '@/stores/timeline'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const clipStore = useClipStore()
const exportStore = useExportStore()
const timelineStore = useTimelineStore()

const selectedQuality = ref<'720p' | '1080p' | 'source'>('1080p')
const isExporting = computed(() => exportStore.isExporting)
const exportProgress = computed(() => exportStore.exportProgress)
const exportError = computed(() => exportStore.exportError)
const lastExportPath = computed(() => exportStore.lastExportPath)

// Detect export mode: timeline vs single clip
const isTimelineExport = computed(() => timelineStore.clips.length > 0)

const selectedClip = computed(() => {
  if (!clipStore.selectedClipId) return null
  return clipStore.getClipById(clipStore.selectedClipId)
})

const timelineInfo = computed(() => {
  if (!isTimelineExport.value) return null
  const uniqueFiles = new Set(timelineStore.clips.map(c => c.clipId)).size
  return {
    clipCount: timelineStore.clips.length,
    duration: timelineStore.totalDuration,
    uniqueFiles
  }
})

// Listen for progress updates from main process
const { ipcRenderer } = window.require('electron')
ipcRenderer.on('export:progress', (_: any, progress: number) => {
  exportStore.updateProgress(progress)
})

// Handle cancel existing export
const handleCancelExport = async () => {
  try {
    await ipcRenderer.invoke('ffmpeg:cancel')
    exportStore.cancelExport()
    emit('update:open', false)
  } catch (error: any) {
    console.error('Cancel failed:', error)
  }
}

// Handle single clip export
const handleSingleClipExport = async () => {
  if (!selectedClip.value) return

  const outputPath = await ipcRenderer.invoke('dialog:saveFile', `${selectedClip.value.name}_export.mp4`)
  if (!outputPath) {
    return
  }

  exportStore.startExport(`Exporting: ${selectedClip.value.name}`, true)
  emit('update:open', false) // Close dialog, show progress in header

  try {
    const result = await ipcRenderer.invoke('ffmpeg:export', {
      inputPath: selectedClip.value.path,
      outputPath,
      quality: selectedQuality.value,
      duration: selectedClip.value.duration
    })

    exportStore.completeExport(outputPath)
  } catch (error: any) {
    console.error('[Export] Single clip export failed:', error)
    exportStore.failExport(error.message || 'Export failed')
  }
}

// Handle timeline export
const handleTimelineExport = async () => {
  if (timelineStore.clips.length === 0) return

  const outputPath = await ipcRenderer.invoke('dialog:saveFile', 'timeline_export.mp4')
  if (!outputPath) {
    return
  }

  // Build clip data for FFmpeg
  const clips = timelineStore.clips.map((tc) => {
    const sourceClip = clipStore.getClipById(tc.clipId)
    return {
      sourceFilePath: sourceClip?.path || '',
      trimStart: tc.trimStart,
      trimEnd: tc.trimEnd,
      duration: tc.duration
    }
  })

  exportStore.startExport(`Exporting Timeline (${clips.length} clips)`, true)
  emit('update:open', false) // Close dialog, show progress in header

  try {
    const result = await ipcRenderer.invoke('ffmpeg:exportTimeline', {
      clips,
      outputPath,
      quality: selectedQuality.value,
      totalDuration: timelineStore.totalDuration
    })

    exportStore.completeExport(outputPath)
  } catch (error: any) {
    console.error('[Export] Timeline export failed:', error)
    exportStore.failExport(error.message || 'Export failed')
  }
}

const handleExport = () => {
  if (isTimelineExport.value) {
    handleTimelineExport()
  } else {
    handleSingleClipExport()
  }
}

const handleClose = () => {
  if (!isExporting.value) {
    emit('update:open', false)
  }
}

const openOutputFolder = async () => {
  if (!lastExportPath.value) return
  const { shell } = window.require('electron')
  shell.showItemInFolder(lastExportPath.value)
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <Dialog :open="props.open" @update:open="handleClose">
    <template #default="{ close }">
      <div class="space-y-6">
        <!-- Cancel Export Dialog -->
        <div v-if="isExporting">
          <h2 class="text-2xl font-semibold">Export In Progress</h2>
          <p class="text-sm text-muted-foreground mt-1">
            An export job is currently running
          </p>

          <div class="mt-6 space-y-4">
            <div class="rounded-lg border p-4 bg-muted/50">
              <p class="font-medium">{{ exportStore.exportJobName }}</p>
              <div class="mt-3 space-y-2">
                <div class="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{{ Math.round(exportProgress) }}%</span>
                </div>
                <Progress :model-value="exportProgress" />
              </div>
            </div>

            <div class="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <p class="text-sm text-yellow-600 dark:text-yellow-400">
                ⚠️ Canceling will stop the export and discard the output file
              </p>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <Button
              @click="handleClose"
              variant="outline"
              class="flex-1"
            >
              Keep Running
            </Button>
            <Button
              @click="handleCancelExport"
              variant="destructive"
              class="flex-1"
            >
              Cancel Export
            </Button>
          </div>
        </div>

        <!-- Normal Export Dialog -->
        <div v-else>
          <h2 class="text-2xl font-semibold">Export Video</h2>
          <p class="text-sm text-muted-foreground mt-1">
            {{ isTimelineExport ? 'Export entire timeline to MP4' : 'Export current clip to MP4' }}
          </p>

          <!-- Timeline Info -->
          <div v-if="isTimelineExport && timelineInfo" class="rounded-lg border p-4 bg-muted/50">
            <div class="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="flex-shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 8h6"/>
                <path d="M9 12h6"/>
                <path d="M9 16h6"/>
              </svg>
              <div>
                <p class="font-medium">Timeline Export</p>
                <p class="text-sm text-muted-foreground">
                  {{ timelineInfo.clipCount }} clips • {{ formatTime(timelineInfo.duration) }} • {{ timelineInfo.uniqueFiles }} source files
                </p>
              </div>
            </div>
          </div>

          <!-- Single Clip Info -->
          <div v-else-if="selectedClip" class="rounded-lg border p-4 bg-muted/50">
            <p class="font-medium">{{ selectedClip.name }}</p>
            <p class="text-sm text-muted-foreground">
              {{ selectedClip.resolution.width }}×{{ selectedClip.resolution.height }} • 
              {{ formatTime(selectedClip.duration) }}
            </p>
          </div>

          <!-- Quality Selection -->
          <div class="space-y-3">
            <label class="text-sm font-medium">Output Quality</label>
            <div class="flex gap-2">
              <Button
                :variant="selectedQuality === '720p' ? 'default' : 'outline'"
                @click="selectedQuality = '720p'"
                class="flex-1"
              >
                720p
              </Button>
              <Button
                :variant="selectedQuality === '1080p' ? 'default' : 'outline'"
                @click="selectedQuality = '1080p'"
                class="flex-1"
              >
                1080p
              </Button>
              <Button
                :variant="selectedQuality === 'source' ? 'default' : 'outline'"
                @click="selectedQuality = 'source'"
                class="flex-1"
              >
                Source
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Export will run in the background. You can continue editing.
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-4">
            <Button
              @click="handleExport"
              :disabled="!isTimelineExport && !selectedClip"
              class="flex-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" x2="12" y1="15" y2="3"/>
              </svg>
              Start Export
            </Button>
            <Button
              @click="handleClose"
              variant="outline"
              class="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>

