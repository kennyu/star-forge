<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'

const appReady = ref(true)
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- Header -->
    <header class="border-b">
      <div class="container flex h-16 items-center px-4">
        <h1 class="text-2xl font-bold">ClipForge</h1>
        <div class="ml-auto flex items-center space-x-4">
          <Button variant="outline">Import</Button>
          <Button>Export</Button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto p-6">
      <div class="rounded-lg border bg-card p-8 text-center">
        <h2 class="text-3xl font-semibold mb-4">Welcome to ClipForge</h2>
        <p class="text-muted-foreground mb-6">
          Desktop video editor built with Electron + Vue + FFmpeg
        </p>
        <div class="flex justify-center gap-4">
          <Button size="lg">Get Started</Button>
          <Button size="lg" variant="outline">Learn More</Button>
        </div>
      </div>
    </main>
  </div>
</template>

<style>
/* Additional styles if needed */
</style>

