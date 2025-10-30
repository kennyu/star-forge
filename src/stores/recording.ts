import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type RecordingMode = 'screen' | 'webcam' | 'screen-pip'
export type RecordingState = 'idle' | 'previewing' | 'recording' | 'processing' | 'completed' | 'error'

export interface AudioSettings {
  microphone: boolean
  systemAudio: boolean
}

export interface ScreenSource {
  id: string
  name: string
  thumbnail: string
}

export const useRecordingStore = defineStore('recording', () => {
  // Recording settings
  const mode = ref<RecordingMode>('screen')
  const audioSettings = ref<AudioSettings>({
    microphone: true,
    systemAudio: false,
  })

  // Recording state
  const state = ref<RecordingState>('idle')
  const errorMessage = ref<string | null>(null)

  // Streams
  const previewStream = ref<MediaStream | null>(null)
  const recordingStream = ref<MediaStream | null>(null)
  const screenStream = ref<MediaStream | null>(null)
  const webcamStream = ref<MediaStream | null>(null)
  const audioStream = ref<MediaStream | null>(null)

  // Available sources
  const availableScreenSources = ref<ScreenSource[]>([])
  const selectedScreenSourceId = ref<string | null>(null)

  // Recording data
  const mediaRecorder = ref<MediaRecorder | null>(null)
  const recordedChunks = ref<Blob[]>([])
  const recordingStartTime = ref<number>(0)
  const elapsedTime = ref<number>(0)
  const recordingTimerInterval = ref<number | null>(null)

  // Canvas for PiP compositing
  const compositeCanvas = ref<HTMLCanvasElement | null>(null)
  const compositeContext = ref<CanvasRenderingContext2D | null>(null)
  const compositeAnimationFrame = ref<number | null>(null)

  // Computed
  const isRecording = computed(() => state.value === 'recording')
  const isPreviewing = computed(() => state.value === 'previewing')
  const canStartRecording = computed(() => {
    return (state.value === 'previewing' || state.value === 'idle') && 
           selectedScreenSourceId.value !== null &&
           (mode.value === 'screen' || mode.value === 'screen-pip' || mode.value === 'webcam')
  })

  // Format elapsed time as MM:SS
  const formattedElapsedTime = computed(() => {
    const mins = Math.floor(elapsedTime.value / 60)
    const secs = Math.floor(elapsedTime.value % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  })

  // Actions
  function setMode(newMode: RecordingMode) {
    if (state.value === 'recording') return
    mode.value = newMode
  }

  function setAudioSettings(settings: Partial<AudioSettings>) {
    if (state.value === 'recording') return
    audioSettings.value = { ...audioSettings.value, ...settings }
  }

  function setAvailableScreenSources(sources: ScreenSource[]) {
    availableScreenSources.value = sources
    if (sources.length > 0 && !selectedScreenSourceId.value) {
      selectedScreenSourceId.value = sources[0].id
    }
  }

  function selectScreenSource(sourceId: string) {
    if (state.value === 'recording') return
    selectedScreenSourceId.value = sourceId
  }

  function setError(message: string) {
    state.value = 'error'
    errorMessage.value = message
  }

  function clearError() {
    errorMessage.value = null
    if (state.value === 'error') {
      state.value = 'idle'
    }
  }

  function setState(newState: RecordingState) {
    state.value = newState
  }

  function setPreviewStream(stream: MediaStream | null) {
    previewStream.value = stream
  }

  function setRecordingStream(stream: MediaStream | null) {
    recordingStream.value = stream
  }

  function setScreenStream(stream: MediaStream | null) {
    screenStream.value = stream
  }

  function setWebcamStream(stream: MediaStream | null) {
    webcamStream.value = stream
  }

  function setAudioStream(stream: MediaStream | null) {
    audioStream.value = stream
  }

  function setMediaRecorder(recorder: MediaRecorder | null) {
    mediaRecorder.value = recorder
  }

  function addRecordedChunk(chunk: Blob) {
    recordedChunks.value.push(chunk)
  }

  function clearRecordedChunks() {
    recordedChunks.value = []
  }

  function startRecordingTimer() {
    recordingStartTime.value = Date.now()
    elapsedTime.value = 0
    
    recordingTimerInterval.value = window.setInterval(() => {
      elapsedTime.value = (Date.now() - recordingStartTime.value) / 1000
    }, 100) // Update every 100ms for smooth display
  }

  function stopRecordingTimer() {
    if (recordingTimerInterval.value) {
      clearInterval(recordingTimerInterval.value)
      recordingTimerInterval.value = null
    }
  }

  function setCompositeCanvas(canvas: HTMLCanvasElement | null) {
    compositeCanvas.value = canvas
    if (canvas) {
      compositeContext.value = canvas.getContext('2d', { 
        alpha: false,
        desynchronized: true // Better performance for animation
      })
    } else {
      compositeContext.value = null
    }
  }

  function setCompositeAnimationFrame(frameId: number | null) {
    compositeAnimationFrame.value = frameId
  }

  function stopAllStreams() {
    // Stop all tracks in all streams
    const streams = [
      previewStream.value,
      recordingStream.value,
      screenStream.value,
      webcamStream.value,
      audioStream.value,
    ]

    streams.forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop()
        })
      }
    })

    // Clear stream references
    previewStream.value = null
    recordingStream.value = null
    screenStream.value = null
    webcamStream.value = null
    audioStream.value = null

    // Cancel animation frame if running
    if (compositeAnimationFrame.value) {
      cancelAnimationFrame(compositeAnimationFrame.value)
      compositeAnimationFrame.value = null
    }

    // Stop timer
    stopRecordingTimer()
  }

  function reset() {
    stopAllStreams()
    clearRecordedChunks()
    state.value = 'idle'
    errorMessage.value = null
    elapsedTime.value = 0
    mediaRecorder.value = null
    compositeCanvas.value = null
    compositeContext.value = null
  }

  return {
    // State
    mode,
    audioSettings,
    state,
    errorMessage,
    previewStream,
    recordingStream,
    screenStream,
    webcamStream,
    audioStream,
    availableScreenSources,
    selectedScreenSourceId,
    mediaRecorder,
    recordedChunks,
    elapsedTime,
    formattedElapsedTime,
    compositeCanvas,
    compositeContext,
    compositeAnimationFrame,

    // Computed
    isRecording,
    isPreviewing,
    canStartRecording,

    // Actions
    setMode,
    setAudioSettings,
    setAvailableScreenSources,
    selectScreenSource,
    setError,
    clearError,
    setState,
    setPreviewStream,
    setRecordingStream,
    setScreenStream,
    setWebcamStream,
    setAudioStream,
    setMediaRecorder,
    addRecordedChunk,
    clearRecordedChunks,
    startRecordingTimer,
    stopRecordingTimer,
    setCompositeCanvas,
    setCompositeAnimationFrame,
    stopAllStreams,
    reset,
  }
})

