<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useClipStore } from '@/stores/clips'

const clipStore = useClipStore()

const clips = computed(() => clipStore.importedClips)
const selectedClipId = computed(() => clipStore.selectedClipId)
const selectedClip = computed(() => {
  if (!selectedClipId.value) return null
  return clipStore.getClipById(selectedClipId.value)
})

const showMetadata = ref(false)

const formatDuration = (seconds: number) => {
  // Handle invalid values
  if (seconds == null || isNaN(seconds) || !isFinite(seconds) || seconds <= 0) {
    console.warn('[MediaLibrary] Invalid duration value:', seconds)
    return '0:00'
  }
  
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatSize = (bytes: number) => {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

const selectClip = (id: string) => {
  // Toggle metadata if clicking the same clip
  if (selectedClipId.value === id) {
    showMetadata.value = !showMetadata.value
  } else {
    clipStore.selectClip(id)
    showMetadata.value = true
  }
}

const removeClip = (id: string, event: Event) => {
  event.stopPropagation()
  clipStore.removeClip(id)
  showMetadata.value = false
}

const handleDragStart = (e: DragEvent, clipId: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('clipId', clipId)
  }
}

// Show file in folder
const showInFolder = (clipId: string) => {
  const clip = clipStore.getClipById(clipId)
  if (!clip) return
  
  const { shell } = window.require('electron')
  shell.showItemInFolder(clip.path)
}

// Copy functions
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const copyMetadataField = async (label: string, value: string) => {
  await copyToClipboard(`${label}: ${value}`)
}

const copyAllMetadata = async () => {
  if (!selectedClip.value) return
  
  const clip = selectedClip.value
  const metadata = `Video Metadata
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${clip.name}
Path: ${clip.path}
Duration: ${formatDuration(clip.duration)} (${clip.duration.toFixed(2)}s)
Resolution: ${clip.resolution.width}×${clip.resolution.height}
File Size: ${formatSize(clip.size)} (${clip.size.toLocaleString()} bytes)
Format: ${clip.type}
Clip ID: ${clip.id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

  await copyToClipboard(metadata)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">Media Library</h2>
      <span class="text-sm text-muted-foreground">{{ clips.length }} clips</span>
    </div>

    <!-- Empty State -->
    <div v-if="clips.length === 0" class="rounded-lg border bg-card p-8 text-center">
      <p class="text-muted-foreground">No clips imported yet</p>
      <p class="text-sm text-muted-foreground mt-1">Import files to get started</p>
    </div>

    <!-- Clips List -->
    <div v-else class="space-y-2">
      <div
        v-for="clip in clips"
        :key="clip.id"
        draggable="true"
        @dragstart="handleDragStart($event, clip.id)"
        @click="selectClip(clip.id)"
        @dblclick="showInFolder(clip.id)"
        :class="[
          'rounded-lg border p-4 cursor-move transition-colors',
          selectedClipId === clip.id
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50'
        ]"
        :title="`Double-click to show in folder: ${clip.path}`"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <h3 class="font-medium truncate">{{ clip.name }}</h3>
            <div class="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span>{{ formatDuration(clip.duration) }}</span>
              <span>{{ clip.resolution.width }}×{{ clip.resolution.height }}</span>
              <span>{{ formatSize(clip.size) }}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            @click="(e: Event) => removeClip(clip.id, e)"
            class="ml-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </Button>
        </div>
      </div>
    </div>

    <!-- Metadata Panel -->
    <div v-if="selectedClip && showMetadata" class="rounded-lg border bg-card">
      <div class="border-b p-4 flex justify-between items-center">
        <h3 class="font-semibold">Video Metadata</h3>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            @click="copyAllMetadata"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
            Copy All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            @click="showMetadata = false"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </Button>
        </div>
      </div>

      <div class="p-4 space-y-3">
        <!-- Name -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">Name</div>
            <div class="text-sm font-mono break-all">{{ selectedClip.name }}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="copyMetadataField('Name', selectedClip.name)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </Button>
        </div>

        <!-- Path -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">File Path</div>
            <div class="text-sm font-mono break-all text-muted-foreground">{{ selectedClip.path }}</div>
          </div>
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              @click="showInFolder(selectedClip.id)"
              title="Show in folder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              @click="copyMetadataField('Path', selectedClip.path)"
              title="Copy path"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
            </Button>
          </div>
        </div>

        <!-- Duration -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">Duration</div>
            <div class="text-sm">
              <span class="font-mono">{{ formatDuration(selectedClip.duration) }}</span>
              <span class="text-muted-foreground ml-2">({{ selectedClip.duration.toFixed(2) }}s)</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="copyMetadataField('Duration', `${formatDuration(selectedClip.duration)} (${selectedClip.duration.toFixed(2)}s)`)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </Button>
        </div>

        <!-- Resolution -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">Resolution</div>
            <div class="text-sm font-mono">{{ selectedClip.resolution.width }}×{{ selectedClip.resolution.height }}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="copyMetadataField('Resolution', `${selectedClip.resolution.width}×${selectedClip.resolution.height}`)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </Button>
        </div>

        <!-- File Size -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">File Size</div>
            <div class="text-sm">
              <span class="font-mono">{{ formatSize(selectedClip.size) }}</span>
              <span class="text-muted-foreground ml-2">({{ selectedClip.size.toLocaleString() }} bytes)</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="copyMetadataField('File Size', `${formatSize(selectedClip.size)} (${selectedClip.size.toLocaleString()} bytes)`)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </Button>
        </div>

        <!-- Format -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">Format</div>
            <div class="text-sm font-mono">{{ selectedClip.type }}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="copyMetadataField('Format', selectedClip.type)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </Button>
        </div>

        <!-- Clip ID -->
        <div class="flex items-start justify-between gap-4 group">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-muted-foreground mb-1">Clip ID</div>
            <div class="text-sm font-mono text-muted-foreground">{{ selectedClip.id }}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="copyMetadataField('Clip ID', selectedClip.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </Button>
        </div>
      </div>

      <div class="border-t p-3 text-xs text-muted-foreground bg-muted/30">
        <p>💡 Tip: Double-click a clip to show in folder • Click again to toggle metadata • Hover to copy fields</p>
      </div>
    </div>
  </div>
</template>

