<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

export interface ProgressProps {
  modelValue?: number | null
  max?: number
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<ProgressProps>(), {
  modelValue: 0,
  max: 100,
})

const progressPercentage = computed(() => {
  if (props.modelValue === null) return 0
  return Math.min(Math.max((props.modelValue / props.max) * 100, 0), 100)
})
</script>

<template>
  <div
    :class="cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', props.class)"
    role="progressbar"
    :aria-valuemax="max"
    :aria-valuemin="0"
    :aria-valuenow="modelValue"
  >
    <div
      class="h-full w-full flex-1 bg-primary transition-all duration-200 ease-in-out"
      :style="{ transform: `translateX(-${100 - progressPercentage}%)` }"
    />
  </div>
</template>

