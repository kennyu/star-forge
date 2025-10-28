<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useClipStore } from '@/stores/clips'
import { useExportStore } from '@/stores/export'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const clipStore = useClipStore()
const exportStore = useExportStore()

const selectedQuality = ref<'720p' | '1080p' | 'source'>('1080p')
const isExporting = computed(() => exportStore.isExporting)
const exportProgress = computed(() => exportStore.exportProgress)
const exportError = computed(() => exportStore.exportError)
const lastExportPath = computed(() => exportStore.lastExportPath)

const selectedClip = computed(() => {
  if (!clipStore.selectedClipId) return null
  return clipStore.getClipById(clipStore.selectedClipId)
})

const handleExport = async () => {
  if (!selectedClip.value) return

  const { ipcRenderer } = window.require('electron')
  
  // Show save dialog
  const outputPath = await ipcRenderer.invoke('dialog:saveFile', 'export.mp4')
  if (!outputPath) return // User cancelled

  exportStore.startExport()

  try {
    // Call FFmpeg export with progress tracking
    await ipcRenderer.invoke('ffmpeg:export', {
      inputPath: selectedClip.value.path,
      outputPath: outputPath,
      quality: selectedQuality.value,
      duration: selectedClip.value.duration
    })

    exportStore.completeExport(outputPath)
  } catch (error: any) {
    exportStore.failExport(error.message || 'Export failed')
  }
}

// Listen for progress updates from main process
const { ipcRenderer } = window.require('electron')
ipcRenderer.on('export:progress', (_: any, progress: number) => {
  exportStore.updateProgress(progress)
})

const handleClose = () => {
  if (!isExporting.value) {
    exportStore.resetExport()
    emit('update:open', false)
  }
}

const openOutputFolder = async () => {
  if (!lastExportPath.value) return
  const { shell } = window.require('electron')
  const path = window.require('path')
  shell.showItemInFolder(lastExportPath.value)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="handleClose">
    <template #default="{ close }">
      <div class="space-y-6">
        <div>
          <h2 class="text-2xl font-semibold">Export Video</h2>
          <p class="text-sm text-muted-foreground mt-1">
            Export current clip to MP4
          </p>
        </div>

        <!-- Clip Info -->
        <div v-if="selectedClip" class="rounded-lg border p-4 bg-muted/50">
          <p class="font-medium">{{ selectedClip.name }}</p>
          <p class="text-sm text-muted-foreground">
            {{ selectedClip.resolution.width }}×{{ selectedClip.resolution.height }} • 
            {{ Math.round(selectedClip.duration) }}s
          </p>
        </div>

        <!-- Quality Selection -->
        <div v-if="!isExporting && !lastExportPath" class="space-y-3">
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
            Higher quality = larger file size and longer export time
          </p>
        </div>

        <!-- Export Progress -->
        <div v-if="isExporting" class="space-y-3">
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>Exporting...</span>
              <span>{{ Math.round(exportProgress) }}%</span>
            </div>
            <Progress :model-value="exportProgress" />
          </div>
          <p class="text-xs text-muted-foreground">
            This may take a few moments depending on video length and quality
          </p>
        </div>

        <!-- Success State -->
        <div v-if="lastExportPath && !isExporting" class="space-y-3">
          <div class="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
            <div class="flex items-start gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-green-500 flex-shrink-0"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <p class="font-medium text-green-500">Export Successful!</p>
                <p class="text-sm text-muted-foreground mt-1">
                  Your video has been exported
                </p>
              </div>
            </div>
          </div>
          <Button @click="openOutputFolder" variant="outline" class="w-full">
            Open Output Folder
          </Button>
        </div>

        <!-- Error State -->
        <div v-if="exportError" class="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <p class="font-medium text-red-500">Export Failed</p>
          <p class="text-sm text-muted-foreground mt-1">{{ exportError }}</p>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3 pt-4">
          <Button
            v-if="!isExporting && !lastExportPath"
            @click="handleExport"
            :disabled="!selectedClip"
            class="flex-1"
          >
            Start Export
          </Button>
          <Button
            v-if="lastExportPath || exportError"
            @click="handleClose"
            class="flex-1"
          >
            Done
          </Button>
          <Button
            v-if="!isExporting && !lastExportPath"
            @click="handleClose"
            variant="outline"
            class="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

