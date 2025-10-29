<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRecordingStore } from '@/stores/recording'
import { useClipStore } from '@/stores/clips'
import fixWebmDuration from 'fix-webm-duration'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const recordingStore = useRecordingStore()
const clipStore = useClipStore()

const { ipcRenderer } = window.require('electron')

// UI refs
const previewVideoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// State
const isLoadingSources = ref(false)
const isSavingRecording = ref(false)

// Computed
const showSourceSelector = computed(() => {
  return recordingStore.mode === 'screen' || recordingStore.mode === 'screen-pip'
})

// Load sources when dialog opens
watch(() => props.open, async (isOpen) => {
  console.log('[RecordingDialog] Dialog open state changed:', isOpen)
  
  if (isOpen) {
    console.log('[RecordingDialog] Dialog opened - loading sources')
    await loadSources()
  } else {
    console.log('[RecordingDialog] Dialog closed')
    // Clean up when dialog closes
    if (!recordingStore.isRecording) {
      console.log('[RecordingDialog] Stopping preview on dialog close')
      stopPreview()
    }
  }
})

async function loadSources() {
  console.log('[RecordingDialog] loadSources called')
  console.log('[RecordingDialog] Current mode:', recordingStore.mode)
  
  if (recordingStore.mode === 'webcam') {
    console.log('[RecordingDialog] Webcam mode - no sources needed')
    // No need to load sources for webcam only
    return
  }

  try {
    isLoadingSources.value = true
    console.log('[RecordingDialog] Requesting sources from main process')
    const sources = await ipcRenderer.invoke('recording:getSources')
    console.log('[RecordingDialog] Received sources:', sources)
    console.log('[RecordingDialog] Number of sources:', sources.length)
    
    recordingStore.setAvailableScreenSources(sources)
    console.log('[RecordingDialog] Sources loaded successfully')
    console.log('[RecordingDialog] Selected source ID:', recordingStore.selectedScreenSourceId)
  } catch (error: any) {
    console.error('[RecordingDialog] Failed to load sources:', error)
    console.error('[RecordingDialog] Error stack:', error.stack)
    recordingStore.setError('Failed to load screen sources: ' + error.message)
  } finally {
    isLoadingSources.value = false
  }
}

// Handle mode change
function handleModeChange(mode: 'screen' | 'webcam' | 'screen-pip') {
  recordingStore.setMode(mode)
  stopPreview()
  
  // Reload sources if needed
  if (mode !== 'webcam' && props.open) {
    loadSources()
  }
}

// Start preview
async function startPreview() {
  console.log('[RecordingDialog] startPreview called')
  console.log('[RecordingDialog] Current mode:', recordingStore.mode)
  console.log('[RecordingDialog] Selected source:', recordingStore.selectedScreenSourceId)
  
  try {
    // Clean up any existing preview first (before setting state)
    console.log('[RecordingDialog] Cleaning up existing streams')
    recordingStore.stopAllStreams()
    
    // Now set state to previewing (this will make the video element render)
    recordingStore.setState('previewing')

    console.log('[RecordingDialog] Starting preview for mode:', recordingStore.mode)

    if (recordingStore.mode === 'webcam') {
      await startWebcamPreview()
    } else if (recordingStore.mode === 'screen') {
      await startScreenPreview()
    } else if (recordingStore.mode === 'screen-pip') {
      await startPiPPreview()
    }

    console.log('[RecordingDialog] Preview stream created:', recordingStore.previewStream)
    console.log('[RecordingDialog] Preview stream tracks:', recordingStore.previewStream?.getTracks())
    console.log('[RecordingDialog] isPreviewing:', recordingStore.isPreviewing)
    console.log('[RecordingDialog] State:', recordingStore.state)

    // Attach preview stream to video element
    // Wait for DOM to update with v-if condition
    await nextTick()
    console.log('[RecordingDialog] After first nextTick - Video element ref:', previewVideoRef.value)
    
    // Sometimes need to wait an additional tick for v-if elements
    if (!previewVideoRef.value) {
      console.log('[RecordingDialog] Video ref not ready, waiting another tick...')
      await nextTick()
      console.log('[RecordingDialog] After second nextTick - Video element ref:', previewVideoRef.value)
    }
    
    if (!previewVideoRef.value) {
      console.error('[RecordingDialog] Video element still not mounted after waiting')
      console.error('[RecordingDialog] previewVideoRef.value:', previewVideoRef.value)
      console.error('[RecordingDialog] isPreviewing:', recordingStore.isPreviewing)
      console.error('[RecordingDialog] state:', recordingStore.state)
    }
    
    if (!recordingStore.previewStream) {
      console.error('[RecordingDialog] Preview stream is null!')
    }
    
    if (previewVideoRef.value && recordingStore.previewStream) {
      console.log('[RecordingDialog] Attaching stream to video element')
      previewVideoRef.value.srcObject = recordingStore.previewStream
      
      // Don't use autoplay for canvas streams, play manually after a small delay
      await new Promise(resolve => setTimeout(resolve, 100))
      
      try {
        // Check if video element is still in document before playing
        if (!previewVideoRef.value || !document.body.contains(previewVideoRef.value)) {
          console.error('[RecordingDialog] Video element was removed from document')
          throw new Error('Video element not in document')
        }
        
        console.log('[RecordingDialog] Attempting to play video')
        const playPromise = previewVideoRef.value.play()
        
        if (playPromise !== undefined) {
          await playPromise
          console.log('[RecordingDialog] Video playing successfully')
        }
      } catch (playError: any) {
        console.error('[RecordingDialog] Failed to play video:', playError)
        // Don't throw on play errors for canvas streams - they might autoplay anyway
        if (playError.name !== 'AbortError') {
          throw playError
        } else {
          console.warn('[RecordingDialog] Play aborted, but stream is attached')
        }
      }
    } else {
      const missingParts = []
      if (!previewVideoRef.value) missingParts.push('videoRef')
      if (!recordingStore.previewStream) missingParts.push('previewStream')
      console.warn('[RecordingDialog] Cannot attach stream - missing:', missingParts.join(', '))
    }
  } catch (error: any) {
    console.error('[RecordingDialog] Preview failed:', error)
    console.error('[RecordingDialog] Error stack:', error.stack)
    recordingStore.setError('Failed to start preview: ' + error.message)
    stopPreview()
  }
}

async function startWebcamPreview() {
  console.log('[RecordingDialog] startWebcamPreview - requesting webcam access')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false // We'll handle audio separately
    })
    
    console.log('[RecordingDialog] Webcam stream obtained:', stream)
    console.log('[RecordingDialog] Webcam video tracks:', stream.getVideoTracks())
    
    recordingStore.setWebcamStream(stream)
    recordingStore.setPreviewStream(stream)
    console.log('[RecordingDialog] Webcam preview setup complete')
  } catch (error: any) {
    console.error('[RecordingDialog] Webcam access failed:', error)
    throw new Error('Failed to access webcam: ' + error.message)
  }
}

async function startScreenPreview() {
  console.log('[RecordingDialog] startScreenPreview called')
  console.log('[RecordingDialog] Selected source ID:', recordingStore.selectedScreenSourceId)
  
  if (!recordingStore.selectedScreenSourceId) {
    console.error('[RecordingDialog] No screen source selected')
    throw new Error('No screen source selected')
  }

  try {
    console.log('[RecordingDialog] Requesting screen capture with source:', recordingStore.selectedScreenSourceId)
    
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: recordingStore.selectedScreenSourceId,
        }
      }
    }
    
    console.log('[RecordingDialog] Screen constraints:', JSON.stringify(constraints, null, 2))
    
    const stream = await (navigator.mediaDevices as any).getUserMedia(constraints)

    console.log('[RecordingDialog] Screen stream obtained:', stream)
    console.log('[RecordingDialog] Screen video tracks:', stream.getVideoTracks())
    
    recordingStore.setScreenStream(stream)
    recordingStore.setPreviewStream(stream)
    console.log('[RecordingDialog] Screen preview setup complete')
  } catch (error: any) {
    console.error('[RecordingDialog] Screen capture failed:', error)
    console.error('[RecordingDialog] Error name:', error.name)
    console.error('[RecordingDialog] Error message:', error.message)
    throw new Error('Failed to capture screen: ' + error.message)
  }
}

async function startPiPPreview() {
  console.log('[RecordingDialog] startPiPPreview called')
  
  if (!recordingStore.selectedScreenSourceId) {
    console.error('[RecordingDialog] No screen source selected for PiP')
    throw new Error('No screen source selected')
  }

  try {
    // Get screen stream
    console.log('[RecordingDialog] PiP - Getting screen stream')
    const screenStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: recordingStore.selectedScreenSourceId,
        }
      }
    })
    console.log('[RecordingDialog] PiP - Screen stream obtained:', screenStream)

    // Get webcam stream with lower resolution for better performance
    console.log('[RecordingDialog] PiP - Getting webcam stream')
    const webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 320, max: 480 },
        height: { ideal: 240, max: 360 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    })
    console.log('[RecordingDialog] PiP - Webcam stream obtained:', webcamStream)

    recordingStore.setScreenStream(screenStream)
    recordingStore.setWebcamStream(webcamStream)

    // Set up canvas for compositing
    await nextTick()
    console.log('[RecordingDialog] PiP - Canvas ref:', canvasRef.value)
    
    if (!canvasRef.value) {
      console.error('[RecordingDialog] Canvas element not ready')
      throw new Error('Canvas element not ready')
    }

    const canvas = canvasRef.value
    recordingStore.setCompositeCanvas(canvas)

    // Start compositing
    console.log('[RecordingDialog] PiP - Starting canvas compositing')
    const compositeStream = await startCanvasCompositing(screenStream, webcamStream, canvas)
    console.log('[RecordingDialog] PiP - Composite stream created:', compositeStream)
    
    recordingStore.setPreviewStream(compositeStream)
    console.log('[RecordingDialog] PiP preview setup complete')
  } catch (error: any) {
    console.error('[RecordingDialog] PiP preview failed:', error)
    throw new Error('Failed to start PiP preview: ' + error.message)
  }
}

async function startCanvasCompositing(
  screenStream: MediaStream,
  webcamStream: MediaStream,
  canvas: HTMLCanvasElement
): Promise<MediaStream> {
  console.log('[RecordingDialog] startCanvasCompositing called')
  
  const ctx = canvas.getContext('2d', { 
    alpha: false, 
    desynchronized: true,
    willReadFrequently: false // Optimize for frequent writes, not reads
  })
  if (!ctx) {
    console.error('[RecordingDialog] Failed to get canvas context')
    throw new Error('Failed to get canvas context')
  }
  
  // Optimize canvas rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low' // Trade quality for performance
  
  console.log('[RecordingDialog] Canvas context obtained with performance optimizations')

  // Create video elements for both streams
  const screenVideo = document.createElement('video')
  const webcamVideo = document.createElement('video')

  screenVideo.srcObject = screenStream
  webcamVideo.srcObject = webcamStream
  screenVideo.muted = true
  webcamVideo.muted = true

  console.log('[RecordingDialog] Playing screen video')
  await screenVideo.play()
  console.log('[RecordingDialog] Playing webcam video')
  await webcamVideo.play()
  console.log('[RecordingDialog] Both videos playing')

  // Set canvas size based on screen stream
  const screenTrack = screenStream.getVideoTracks()[0]
  const settings = screenTrack.getSettings()
  canvas.width = settings.width || 1920
  canvas.height = settings.height || 1080
  console.log('[RecordingDialog] Canvas size set to:', canvas.width, 'x', canvas.height)

  // Calculate PiP position (bottom-right, 15% of screen width for better performance)
  const pipWidth = canvas.width * 0.15
  const pipHeight = pipWidth * (3 / 4) // Force 4:3 aspect ratio for consistency
  const pipX = canvas.width - pipWidth - 20
  const pipY = canvas.height - pipHeight - 20
  console.log('[RecordingDialog] PiP overlay position:', { pipX, pipY, pipWidth, pipHeight })

  // Render loop - optimized for performance
  let frameCount = 0
  let isRenderLoopActive = true
  let lastRenderTime = 0
  const targetFrameTime = 1000 / 30 // 30 FPS
  
  function render(currentTime: number = 0) {
    // Check if we should stop rendering
    const shouldContinue = recordingStore.isPreviewing || recordingStore.isRecording
    
    if (!shouldContinue || !isRenderLoopActive) {
      // Cleanup if preview/recording stopped
      console.log('[RecordingDialog] Stopping canvas render loop')
      screenVideo.pause()
      webcamVideo.pause()
      isRenderLoopActive = false
      return
    }

    // Throttle to 30 FPS to reduce CPU usage
    const elapsed = currentTime - lastRenderTime
    if (elapsed < targetFrameTime) {
      const frameId = requestAnimationFrame(render)
      recordingStore.setCompositeAnimationFrame(frameId)
      return
    }
    lastRenderTime = currentTime - (elapsed % targetFrameTime)

    // Verify video elements are still playing (check less frequently)
    if (frameCount % 30 === 0) {
      if (screenVideo.paused) {
        screenVideo.play().catch(e => console.error('[RecordingDialog] Failed to resume screen video:', e))
      }
      if (webcamVideo.paused) {
        webcamVideo.play().catch(e => console.error('[RecordingDialog] Failed to resume webcam video:', e))
      }
    }

    // Draw screen feed (full screen)
    if (ctx) {
      ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height)

      // Draw webcam PiP with border (smaller overlay for better performance)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(pipX - 1, pipY - 1, pipWidth + 2, pipHeight + 2)
      ctx.drawImage(webcamVideo, pipX, pipY, pipWidth, pipHeight)
    }

    // Log every 60 frames (once every 2 seconds) to reduce console overhead
    if (frameCount % 60 === 0) {
      console.log('[RecordingDialog] Canvas rendering - frame', frameCount)
    }
    frameCount++

    const frameId = requestAnimationFrame(render)
    recordingStore.setCompositeAnimationFrame(frameId)
  }

  console.log('[RecordingDialog] Starting render loop')
  render()

  // Capture canvas as stream
  console.log('[RecordingDialog] Capturing canvas as stream at 30 FPS')
  const compositeStream = canvas.captureStream(30) // 30 FPS
  console.log('[RecordingDialog] Composite stream captured:', compositeStream)
  console.log('[RecordingDialog] Composite stream tracks:', compositeStream.getTracks())
  
  return compositeStream
}

function stopPreview() {
  console.log('[RecordingDialog] stopPreview called')
  console.log('[RecordingDialog] Current state:', recordingStore.state)
  
  recordingStore.stopAllStreams()
  
  if (previewVideoRef.value) {
    console.log('[RecordingDialog] Clearing video srcObject')
    previewVideoRef.value.srcObject = null
  }

  if (recordingStore.state === 'previewing') {
    console.log('[RecordingDialog] Setting state to idle')
    recordingStore.setState('idle')
  }
  
  console.log('[RecordingDialog] stopPreview complete')
}

// Start recording
async function startRecording() {
  console.log('[RecordingDialog] startRecording called')
  
  try {
    recordingStore.setState('recording')
    recordingStore.clearRecordedChunks()
    console.log('[RecordingDialog] Recording state set, chunks cleared')

    // Get the video stream (from preview)
    let videoStream = recordingStore.previewStream

    if (!videoStream) {
      console.error('[RecordingDialog] No preview stream available for recording')
      throw new Error('No video stream available')
    }

    console.log('[RecordingDialog] Using video stream:', videoStream)
    console.log('[RecordingDialog] Video tracks:', videoStream.getVideoTracks())

    // Get audio stream if needed
    let audioTracks: MediaStreamTrack[] = []

    if (recordingStore.audioSettings.microphone) {
      try {
        console.log('[RecordingDialog] Requesting microphone access')
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioTracks.push(...micStream.getAudioTracks())
        recordingStore.setAudioStream(micStream)
        console.log('[RecordingDialog] Microphone tracks added:', micStream.getAudioTracks())
      } catch (error) {
        console.warn('[RecordingDialog] Failed to get microphone:', error)
      }
    }

    if (recordingStore.audioSettings.systemAudio && recordingStore.screenStream) {
      // System audio comes from screen stream
      const systemAudioTracks = recordingStore.screenStream.getAudioTracks()
      audioTracks.push(...systemAudioTracks)
      console.log('[RecordingDialog] System audio tracks added:', systemAudioTracks)
    }

    // Combine video and audio tracks
    const recordingStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioTracks
    ])

    console.log('[RecordingDialog] Recording stream created with tracks:', recordingStream.getTracks())
    recordingStore.setRecordingStream(recordingStream)

    // Create MediaRecorder with compatible codec settings
    let mediaRecorder: MediaRecorder
    let mimeType = 'video/webm;codecs=vp8,opus' // VP8 is more compatible than VP9
    
    // Try VP8 first (better compatibility)
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('[RecordingDialog] Using VP8 codec for maximum compatibility')
      mediaRecorder = new MediaRecorder(recordingStream, { 
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      })
    } else {
      // Fallback to browser default
      console.warn('[RecordingDialog] VP8 not supported, using browser default')
      mimeType = 'video/webm'
      mediaRecorder = new MediaRecorder(recordingStream, {
        videoBitsPerSecond: 2500000
      })
    }

    console.log('[RecordingDialog] MediaRecorder created with mimeType:', mimeType)
    console.log('[RecordingDialog] MediaRecorder state:', mediaRecorder.state)

    mediaRecorder.ondataavailable = (event) => {
      console.log('[RecordingDialog] Data available event:', event.data.size, 'bytes')
      if (event.data && event.data.size > 0) {
        recordingStore.addRecordedChunk(event.data)
        console.log('[RecordingDialog] Chunk added. Total chunks:', recordingStore.recordedChunks.length)
      }
    }

    mediaRecorder.onstop = async () => {
      console.log('[RecordingDialog] MediaRecorder stopped')
      console.log('[RecordingDialog] Total chunks collected:', recordingStore.recordedChunks.length)
      await processRecording()
    }

    mediaRecorder.onerror = (event: any) => {
      console.error('[RecordingDialog] MediaRecorder error:', event.error)
      recordingStore.setError('Recording error: ' + event.error)
    }

    mediaRecorder.onstart = () => {
      console.log('[RecordingDialog] MediaRecorder started')
    }

    recordingStore.setMediaRecorder(mediaRecorder)
    
    console.log('[RecordingDialog] Starting MediaRecorder with 1000ms timeslice')
    mediaRecorder.start(1000) // Collect data every second

    // Start timer
    recordingStore.startRecordingTimer()

    console.log('[RecordingDialog] Recording started successfully')
  } catch (error: any) {
    console.error('[RecordingDialog] Failed to start recording:', error)
    console.error('[RecordingDialog] Error stack:', error.stack)
    recordingStore.setError('Failed to start recording: ' + error.message)
    recordingStore.setState('idle')
  }
}

// Stop recording
function stopRecording() {
  console.log('[RecordingDialog] Stopping recording...')
  console.log('[RecordingDialog] MediaRecorder state:', recordingStore.mediaRecorder?.state)
  
  if (recordingStore.mediaRecorder && recordingStore.mediaRecorder.state !== 'inactive') {
    console.log('[RecordingDialog] Calling mediaRecorder.stop()')
    recordingStore.mediaRecorder.stop()
  } else {
    console.warn('[RecordingDialog] MediaRecorder not active or missing')
  }

  recordingStore.stopRecordingTimer()
  console.log('[RecordingDialog] Recording timer stopped')
}

// Process recorded data
async function processRecording() {
  try {
    recordingStore.setState('processing')
    
    const chunks = recordingStore.recordedChunks
    if (chunks.length === 0) {
      throw new Error('No recorded data')
    }

    console.log('[Recording] Processing', chunks.length, 'chunks')
    
    // Create blob from chunks
    const originalBlob = new Blob(chunks, { type: 'video/webm' })
    console.log('[Recording] Original blob size:', originalBlob.size, 'bytes')
    
    // Fix WebM duration metadata using the elapsed recording time
    const recordingDurationMs = recordingStore.elapsedTime * 1000 // Convert seconds to milliseconds
    console.log('[Recording] Fixing WebM duration metadata. Elapsed time:', recordingDurationMs, 'ms')
    
    const fixedBlob = await fixWebmDuration(originalBlob, recordingDurationMs, { logger: false })
    console.log('[Recording] Fixed blob size:', fixedBlob.size, 'bytes')
    
    const arrayBuffer = await fixedBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log('[Recording] Buffer size:', buffer.length, 'bytes')

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `recording-${timestamp}.webm`

    // Save to file
    isSavingRecording.value = true
    const result = await ipcRenderer.invoke('recording:saveRecording', {
      buffer,
      filename
    })

    if (result.canceled) {
      console.log('[Recording] Save cancelled by user')
      recordingStore.setState('idle')
      return
    }

    if (!result.success) {
      throw new Error('Failed to save recording')
    }

    console.log('[Recording] Recording saved:', result.filePath)

    // Add to media library
    const clip = {
      id: Date.now().toString(),
      name: result.metadata.name,
      path: result.filePath,
      duration: result.metadata.duration,
      resolution: result.metadata.resolution,
      size: result.metadata.size,
      type: result.metadata.type
    }

    clipStore.addClip(clip)
    console.log('[Recording] Added to media library:', clip)

    recordingStore.setState('completed')

    // Close dialog after short delay
    setTimeout(() => {
      emit('update:open', false)
      recordingStore.reset()
    }, 1500)

  } catch (error: any) {
    console.error('[Recording] Failed to process recording:', error)
    recordingStore.setError('Failed to save recording: ' + error.message)
  } finally {
    isSavingRecording.value = false
  }
}

// Handle dialog close
function handleClose() {
  if (recordingStore.isRecording) {
    // Don't allow closing during recording
    return
  }

  stopPreview()
  emit('update:open', false)
  
  // Reset after closing
  setTimeout(() => {
    recordingStore.reset()
  }, 300)
}

// Cleanup on unmount
onBeforeUnmount(() => {
  stopPreview()
  recordingStore.reset()
})
</script>

<template>
  <Dialog :open="props.open" @update:open="handleClose">
    <div class="space-y-6 max-w-4xl">
      <!-- Header -->
      <div>
        <h2 class="text-2xl font-semibold">Record Video</h2>
        <p class="text-sm text-muted-foreground mt-1">
          Record your screen, webcam, or both with audio
        </p>
      </div>

      <!-- Recording State: Processing -->
      <div v-if="recordingStore.state === 'processing'" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p class="text-lg font-medium">Saving recording...</p>
        <p class="text-sm text-muted-foreground mt-2">Please wait</p>
      </div>

      <!-- Recording State: Completed -->
      <div v-else-if="recordingStore.state === 'completed'" class="text-center py-8">
        <div class="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-500">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <p class="text-lg font-medium">Recording saved!</p>
        <p class="text-sm text-muted-foreground mt-2">Added to media library</p>
      </div>

      <!-- Main Recording UI -->
      <div v-else class="space-y-6">
        <!-- Mode Selection -->
        <div class="space-y-3">
          <label class="text-sm font-medium">Recording Mode</label>
          <div class="flex gap-2">
            <Button
              :variant="recordingStore.mode === 'screen' ? 'default' : 'outline'"
              @click="handleModeChange('screen')"
              :disabled="recordingStore.isRecording"
              class="flex-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
                <rect width="20" height="14" x="2" y="3" rx="2"/>
                <line x1="8" x2="16" y1="21" y2="21"/>
                <line x1="12" x2="12" y1="17" y2="21"/>
              </svg>
              Screen Only
            </Button>
            <Button
              :variant="recordingStore.mode === 'webcam' ? 'default' : 'outline'"
              @click="handleModeChange('webcam')"
              :disabled="recordingStore.isRecording"
              class="flex-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
                <path d="M7 21h10"/>
                <path d="M12 3v18"/>
                <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
              </svg>
              Webcam Only
            </Button>
            <Button
              :variant="recordingStore.mode === 'screen-pip' ? 'default' : 'outline'"
              @click="handleModeChange('screen-pip')"
              :disabled="recordingStore.isRecording"
              class="flex-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
                <path d="M21 2H3v16h5v4h13V10h-5V2z"/>
                <path d="M21 10V7"/>
              </svg>
              Screen + PiP
            </Button>
          </div>
        </div>

        <!-- Source Selection -->
        <div v-if="showSourceSelector" class="space-y-3">
          <label class="text-sm font-medium">Screen Source</label>
          <div v-if="isLoadingSources" class="text-sm text-muted-foreground">
            Loading sources...
          </div>
          <div v-else class="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
            <button
              v-for="source in recordingStore.availableScreenSources"
              :key="source.id"
              @click="recordingStore.selectScreenSource(source.id)"
              :disabled="recordingStore.isRecording"
              :class="[
                'relative border rounded-lg p-2 text-left transition-all',
                recordingStore.selectedScreenSourceId === source.id
                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                  : 'border-border hover:border-primary/50'
              ]"
            >
              <img :src="source.thumbnail" :alt="source.name" class="w-full rounded mb-2" />
              <p class="text-xs font-medium truncate">{{ source.name }}</p>
            </button>
          </div>
        </div>

        <!-- Audio Settings -->
        <div class="space-y-3">
          <label class="text-sm font-medium">Audio Sources</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                :checked="recordingStore.audioSettings.microphone"
                @change="recordingStore.setAudioSettings({ microphone: !recordingStore.audioSettings.microphone })"
                :disabled="recordingStore.isRecording"
                class="w-4 h-4"
              />
              <span class="text-sm">Microphone</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                :checked="recordingStore.audioSettings.systemAudio"
                @change="recordingStore.setAudioSettings({ systemAudio: !recordingStore.audioSettings.systemAudio })"
                :disabled="recordingStore.isRecording || recordingStore.mode === 'webcam'"
                class="w-4 h-4"
              />
              <span class="text-sm">System Audio</span>
              <span v-if="recordingStore.mode === 'webcam'" class="text-xs text-muted-foreground">(not available for webcam)</span>
            </label>
          </div>
        </div>

        <!-- Preview Area -->
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <label class="text-sm font-medium">Preview</label>
            <div v-if="recordingStore.isRecording" class="flex items-center gap-2 text-red-500">
              <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
              <span class="text-sm font-mono">{{ recordingStore.formattedElapsedTime }}</span>
            </div>
          </div>
          
          <div class="relative rounded-lg border bg-black aspect-video overflow-hidden">
            <!-- Preview Video -->
            <video
              v-if="recordingStore.isPreviewing || recordingStore.isRecording"
              ref="previewVideoRef"
              autoplay
              muted
              class="w-full h-full object-contain"
            ></video>

            <!-- Hidden Canvas for PiP compositing -->
            <canvas
              ref="canvasRef"
              v-show="false"
              class="hidden"
            ></canvas>

            <!-- No Preview State -->
            <div
              v-if="!recordingStore.isPreviewing && !recordingStore.isRecording"
              class="absolute inset-0 flex items-center justify-center text-muted-foreground"
            >
              <div class="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="mx-auto mb-3 opacity-50"
                >
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor"/>
                </svg>
                <p class="text-sm">Click "Start Preview" to see what will be recorded</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Error Display -->
        <div v-if="recordingStore.errorMessage" class="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <div class="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-500 flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="m15 9-6 6"/><path d="m9 9 6 6"/>
            </svg>
            <div class="flex-1">
              <p class="text-sm font-medium text-red-500">Error</p>
              <p class="text-sm text-red-400 mt-1">{{ recordingStore.errorMessage }}</p>
            </div>
            <Button variant="ghost" size="sm" @click="recordingStore.clearError()">
              Dismiss
            </Button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3 pt-4">
          <!-- Preview/Recording Controls -->
          <div v-if="!recordingStore.isRecording" class="flex gap-3 flex-1">
            <Button
              v-if="!recordingStore.isPreviewing"
              @click="startPreview"
              :disabled="!recordingStore.selectedScreenSourceId && recordingStore.mode !== 'webcam'"
              class="flex-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Start Preview
            </Button>
            <Button
              v-else
              @click="startRecording"
              :disabled="!recordingStore.canStartRecording"
              class="flex-1 bg-red-600 hover:bg-red-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="mr-2">
                <circle cx="12" cy="12" r="10"/>
              </svg>
              Start Recording
            </Button>
          </div>

          <!-- Stop Recording -->
          <Button
            v-if="recordingStore.isRecording"
            @click="stopRecording"
            variant="destructive"
            class="flex-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="mr-2">
              <rect width="12" height="12" x="6" y="6" rx="2"/>
            </svg>
            Stop Recording
          </Button>

          <!-- Close -->
          <Button
            @click="handleClose"
            variant="outline"
            :disabled="recordingStore.isRecording"
            class="flex-1"
          >
            {{ recordingStore.isPreviewing ? 'Cancel' : 'Close' }}
          </Button>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
/* Custom checkbox styling if needed */
input[type="checkbox"] {
  accent-color: hsl(var(--primary));
}
</style>

