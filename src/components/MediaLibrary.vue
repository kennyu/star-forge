<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useClipStore } from '@/stores/clips'

const clipStore = useClipStore()

const clips = computed(() => clipStore.importedClips)
const selectedClipId = computed(() => clipStore.selectedClipId)

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatSize = (bytes: number) => {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

const selectClip = (id: string) => {
  clipStore.selectClip(id)
}

const removeClip = (id: string, event: Event) => {
  event.stopPropagation()
  clipStore.removeClip(id)
}

const handleDragStart = (e: DragEvent, clipId: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('clipId', clipId)
  }
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
        :class="[
          'rounded-lg border p-4 cursor-move transition-colors',
          selectedClipId === clip.id
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50'
        ]"
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
  </div>
</template>

