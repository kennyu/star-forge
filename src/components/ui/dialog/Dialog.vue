<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

export interface DialogProps {
  open?: boolean
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<DialogProps>(), {
  open: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const close = () => {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-background/80 backdrop-blur-sm" />
        
        <!-- Dialog Content -->
        <div
          :class="cn(
            'relative z-50 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg',
            props.class
          )"
        >
          <slot :close="close" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>

