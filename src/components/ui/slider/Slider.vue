<script setup lang="ts">
import { computed, ref, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

export interface SliderProps {
  modelValue?: number
  min?: number
  max?: number
  step?: number
  class?: HTMLAttributes['class']
  disabled?: boolean
}

const props = withDefaults(defineProps<SliderProps>(), {
  modelValue: 0,
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const handleInput = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', value)
}

const percentage = computed(() => {
  return ((props.modelValue - props.min) / (props.max - props.min)) * 100
})
</script>

<template>
  <div :class="cn('relative flex w-full touch-none select-none items-center', props.class)">
    <div class="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <div
        class="absolute h-full bg-primary"
        :style="{ width: `${percentage}%` }"
      />
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      class="absolute h-2 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:ring-offset-background [&::-webkit-slider-thumb]:transition-colors focus-visible:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      @input="handleInput"
    />
  </div>
</template>

