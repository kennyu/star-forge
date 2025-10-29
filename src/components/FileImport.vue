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
    // Use webUtils to get proper file paths
    const { webUtils } = window.require('electron')
    const filePaths = Array.from(files).map(f => webUtils.getPathForFile(f))
    await processFiles(filePaths)
  }
}

// Get duration from HTML5 video element (fast fallback for files without duration metadata)
const getVideoDuration = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    
    let hasResponded = false
    
    const cleanup = () => {
      if (!hasResponded) {
        hasResponded = true
        video.onloadedmetadata = null
        video.onerror = null
        video.src = ''
      }
    }
    
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        cleanup()
        reject(new Error('Video duration extraction timeout'))
      }
    }, 5000) // 5 second timeout
    
    video.onloadedmetadata = () => {
      if (!hasResponded) {
        clearTimeout(timeout)
        const duration = video.duration
        cleanup()
        resolve(duration)
      }
    }
    
    video.onerror = () => {
      if (!hasResponded) {
        clearTimeout(timeout)
        console.warn('[FileImport] Video element could not load file (this is normal for some formats)')
        cleanup()
        reject(new Error('Failed to load video metadata'))
      }
    }
    
    // Use file:// protocol for local files
    video.src = `file://${filePath}`
  })
}

// Process imported files
const processFiles = async (filePaths: string[]) => {
  isProcessing.value = true
  const { ipcRenderer } = window.require('electron')
  
  try {
    for (const filePath of filePaths) {
      // Get metadata from FFprobe
      const metadata = await ipcRenderer.invoke('ffmpeg:getMetadata', filePath)
      
      if (metadata) {
        let duration = metadata.duration
        
        // If duration is 0 or invalid, try HTML5 video element (fast fallback)
        if (!duration || duration === 0 || isNaN(duration)) {
          try {
            duration = await getVideoDuration(filePath)
          } catch (videoError) {
            console.warn('[FileImport] Could not extract duration. File will show 0:00. This is a known issue with some WebM recordings.')
            // Keep duration as 0 if all methods fail
            duration = 0
          }
        }
        
        const clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: metadata.name,
          path: filePath,
          duration: duration,
          resolution: metadata.resolution,
          size: metadata.size,
          type: metadata.type,
        }
        clipStore.addClip(clip)
      } else {
        console.warn('[FileImport] No metadata returned for:', filePath)
      }
    }
  } catch (error) {
    console.error('[FileImport] Error processing files:', error)
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

