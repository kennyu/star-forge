import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface RecordingDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'videoinput'
}

export const useRecordingStore = defineStore('recording', () => {
  const isRecording = ref(false)
  const isPaused = ref(false)
  const recordingDuration = ref(0)
  const recordingSize = ref(0)
  
  const selectedMicrophone = ref<string | null>(null)
  const availableMicrophones = ref<RecordingDevice[]>([])
  
  const mediaRecorder = ref<MediaRecorder | null>(null)
  const recordedChunks = ref<Blob[]>([])

  function startRecording() {
    isRecording.value = true
    isPaused.value = false
    recordingDuration.value = 0
    recordingSize.value = 0
    recordedChunks.value = []
  }

  function pauseRecording() {
    isPaused.value = true
  }

  function resumeRecording() {
    isPaused.value = false
  }

  function stopRecording() {
    isRecording.value = false
    isPaused.value = false
  }

  function updateDuration(duration: number) {
    recordingDuration.value = duration
  }

  function updateSize(size: number) {
    recordingSize.value = size
  }

  function setMediaRecorder(recorder: MediaRecorder) {
    mediaRecorder.value = recorder
  }

  function addChunk(chunk: Blob) {
    recordedChunks.value.push(chunk)
  }

  function clearRecording() {
    isRecording.value = false
    isPaused.value = false
    recordingDuration.value = 0
    recordingSize.value = 0
    mediaRecorder.value = null
    recordedChunks.value = []
  }

  function setMicrophones(devices: RecordingDevice[]) {
    availableMicrophones.value = devices
    if (devices.length > 0 && !selectedMicrophone.value) {
      selectedMicrophone.value = devices[0].deviceId
    }
  }

  function selectMicrophone(deviceId: string) {
    selectedMicrophone.value = deviceId
  }

  return {
    isRecording,
    isPaused,
    recordingDuration,
    recordingSize,
    selectedMicrophone,
    availableMicrophones,
    mediaRecorder,
    recordedChunks,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    updateDuration,
    updateSize,
    setMediaRecorder,
    addChunk,
    clearRecording,
    setMicrophones,
    selectMicrophone,
  }
})

