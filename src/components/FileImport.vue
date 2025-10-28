<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useClipStore } from '@/stores/clips'

const clipStore = useClipStore()
const isDragging = ref(false)
const isProcessing = ref(false)

// Handle file picker
const handleFilePicker = async () => {
  const { ipcRenderer } = window.require('electron')
  const filePaths = await ipcRenderer.invoke('dialog:openFile')
  
  if (filePaths && filePaths.length > 0) {
    await processFiles(filePaths)
  }
}

// Handle drag and drop
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const filePaths = Array.from(files).map(f => f.path)
    await processFiles(filePaths)
  }
}

// Process imported files
const processFiles = async (filePaths: string[]) => {
  isProcessing.value = true
  const { ipcRenderer } = window.require('electron')
  
  try {
    for (const filePath of filePaths) {
      // Get metadata from FFmpeg
      const metadata = await ipcRenderer.invoke('ffmpeg:getMetadata', filePath)
      
      if (metadata) {
        clipStore.addClip({
          id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: metadata.name,
          path: filePath,
          duration: metadata.duration,
          resolution: metadata.resolution,
          size: metadata.size,
          type: metadata.type,
        })
      }
    }
  } catch (error) {
    console.error('Error processing files:', error)
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- File Picker Button -->
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">Import Media</h2>
      <Button @click="handleFilePicker" :disabled="isProcessing">
        <span v-if="!isProcessing">Import Files</span>
        <span v-else>Processing...</span>
      </Button>
    </div>

    <!-- Drag and Drop Zone -->
    <div
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      :class="[
        'relative rounded-lg border-2 border-dashed transition-colors p-12 text-center',
        isDragging 
          ? 'border-primary bg-primary/5' 
          : 'border-border hover:border-primary/50'
      ]"
    >
      <div class="flex flex-col items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-muted-foreground"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
        <div>
          <p class="text-lg font-medium">
            {{ isDragging ? 'Drop files here' : 'Drag and drop video files' }}
          </p>
          <p class="text-sm text-muted-foreground mt-1">
            or click the Import Files button above
          </p>
        </div>
        <p class="text-xs text-muted-foreground mt-2">
          Supports MP4, MOV, WebM, AVI, MKV
        </p>
      </div>
    </div>
  </div>
</template>

