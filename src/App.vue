<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import FileImport from '@/components/FileImport.vue'
import MediaLibrary from '@/components/MediaLibrary.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import { useClipStore } from '@/stores/clips'

const clipStore = useClipStore()
const hasClips = computed(() => clipStore.importedClips.length > 0)
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- Header -->
    <header class="border-b">
      <div class="container flex h-16 items-center px-4">
        <h1 class="text-2xl font-bold">ClipForge</h1>
        <div class="ml-auto flex items-center space-x-4">
          <Button variant="outline" disabled>Preview</Button>
          <Button disabled>Export</Button>
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

      <!-- Video Preview -->
      <div v-if="hasClips" class="mt-6">
        <VideoPlayer />
      </div>

      <!-- Placeholder for timeline -->
      <div v-if="hasClips" class="mt-6 rounded-lg border bg-card p-8 text-center">
        <p class="text-muted-foreground">Timeline will appear here</p>
        <p class="text-sm text-muted-foreground mt-1">Coming in Layer 3</p>
      </div>
    </main>
  </div>
</template>

<style>
/* Additional styles if needed */
</style>

