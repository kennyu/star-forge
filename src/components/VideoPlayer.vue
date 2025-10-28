<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useClipStore } from '@/stores/clips'

const clipStore = useClipStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isLoading = ref(false)

// Get the selected clip
const selectedClip = computed(() => {
  if (!clipStore.selectedClipId) return null
  return clipStore.getClipById(clipStore.selectedClipId)
})

// Video source URL - use file:// protocol
const videoSrc = computed(() => {
  if (!selectedClip.value) return ''
  return `file://${selectedClip.value.path}`
})

// Watch for clip changes and load new video
watch(selectedClip, (newClip) => {
  if (newClip && videoRef.value) {
    isLoading.value = true
    videoRef.value.load()
  }
})

// Play/Pause toggle
const togglePlayPause = () => {
  if (!videoRef.value) return
  
  if (isPlaying.value) {
    videoRef.value.pause()
  } else {
    videoRef.value.play()
  }
}

// Video event handlers
const handlePlay = () => {
  isPlaying.value = true
}

const handlePause = () => {
  isPlaying.value = false
}

const handleTimeUpdate = () => {
  if (videoRef.value) {
    currentTime.value = videoRef.value.currentTime
  }
}

const handleLoadedMetadata = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration
    isLoading.value = false
  }
}

const handleWaiting = () => {
  isLoading.value = true
}

const handleCanPlay = () => {
  isLoading.value = false
}

// Seek to specific time
const handleSeek = (value: number) => {
  if (videoRef.value) {
    videoRef.value.currentTime = value
    currentTime.value = value
  }
}

// Format time as MM:SS
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">Preview</h2>
      <span v-if="selectedClip" class="text-sm text-muted-foreground">
        {{ selectedClip.name }}
      </span>
    </div>

    <!-- Video Container -->
    <div class="relative rounded-lg border bg-black aspect-video overflow-hidden">
      <!-- No clip selected state -->
      <div
        v-if="!selectedClip"
        class="absolute inset-0 flex items-center justify-center text-muted-foreground"
      >
        <div class="text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="mx-auto mb-4"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <p class="text-lg">Select a clip to preview</p>
        </div>
      </div>

      <!-- Video Element -->
      <video
        v-if="selectedClip"
        ref="videoRef"
        :src="videoSrc"
        class="w-full h-full object-contain"
        @play="handlePlay"
        @pause="handlePause"
        @timeupdate="handleTimeUpdate"
        @loadedmetadata="handleLoadedMetadata"
        @waiting="handleWaiting"
        @canplay="handleCanPlay"
      />

      <!-- Loading Overlay -->
      <div
        v-if="isLoading && selectedClip"
        class="absolute inset-0 flex items-center justify-center bg-black/50"
      >
        <div class="text-white">Loading...</div>
      </div>
    </div>

    <!-- Controls -->
    <div v-if="selectedClip" class="space-y-3">
      <!-- Timeline/Seek Bar -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted-foreground w-12 text-right">
          {{ formatTime(currentTime) }}
        </span>
        <Slider
          :model-value="currentTime"
          :min="0"
          :max="duration || 100"
          :step="0.1"
          @update:model-value="handleSeek"
          class="flex-1"
        />
        <span class="text-sm text-muted-foreground w-12">
          {{ formatTime(duration) }}
        </span>
      </div>

      <!-- Playback Controls -->
      <div class="flex items-center justify-center gap-2">
        <Button
          @click="togglePlayPause"
          size="lg"
          :disabled="isLoading"
        >
          <svg
            v-if="!isPlaying"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          <span class="ml-2">{{ isPlaying ? 'Pause' : 'Play' }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>

