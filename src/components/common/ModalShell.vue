<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{ label: string; tone?: 'amber' | 'neutral'; closable?: boolean; wide?: boolean }>(), { tone: 'amber', closable: false, wide: false })
const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)
let previous: Element | null = null

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closable) emit('close')
}

onMounted(() => {
  previous = document.activeElement
  document.addEventListener('keydown', onKey)
  root.value?.focus()
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  if (previous instanceof HTMLElement) previous.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal" @mousedown.self="props.closable && emit('close')">
      <div ref="root" class="modal__box" :class="[`modal__box--${tone}`, { 'modal__box--wide': wide }]" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px; background: rgba(8, 6, 14, .78); backdrop-filter: blur(3px); overflow: auto; animation: fade .2s ease-out; }
.modal__box {
  width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: var(--panel);
  border: 2px solid var(--line-2); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--line), 0 24px 60px #000c;
  animation: rise .25s steps(6); outline: none;
}
.modal__box--amber { border-color: var(--amber); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--amber-dim), 0 24px 60px #000c; }
.modal__box--wide { width: min(820px, 100%); }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(14px); opacity: 0; } }
</style>
