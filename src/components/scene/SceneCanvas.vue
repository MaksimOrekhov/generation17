<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SCENE_H, SCENE_W, pickScene } from '../../render/scene'
import type { SceneModel } from '../../render/scene'

const props = defineProps<{ model: SceneModel }>()
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
let mounted = false
let reducedMotion = false
let pageVisible = false
let media: MediaQueryList | null = null

function render(time = 0) {
  const element = canvas.value
  if (!element) return
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  pickScene(props.model).draw(ctx, time, props.model)
}

function cancel() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

function start() {
  cancel()
  render(0)
  if (!mounted || !pageVisible || reducedMotion) return
  let startedAt: number | null = null
  const tick = (timestamp: number) => {
    frame = 0
    if (!mounted || !pageVisible || reducedMotion) return
    startedAt ??= timestamp
    render((timestamp - startedAt) / 1000)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

function syncVisibility() {
  if (typeof document === 'undefined') return
  pageVisible = !document.hidden
  start()
}

function syncMotion(event?: MediaQueryListEvent) {
  reducedMotion = event?.matches ?? media?.matches ?? false
  start()
}

onMounted(() => {
  mounted = true
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    render(0)
    return
  }
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', syncMotion)
  document.addEventListener('visibilitychange', syncVisibility)
  pageVisible = !document.hidden
  reducedMotion = media.matches
  start()
})

watch(() => [
  props.model.name, props.model.age, props.model.wealth, props.model.sectorId,
  props.model.companion?.name, props.model.companion?.age, props.model.companion?.kind,
  props.model.householdLook, props.model.scene.sceneId, props.model.scene.spot, props.model.scene.ariaLabel
], () => start())

onBeforeUnmount(() => {
  mounted = false
  cancel()
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', syncVisibility)
  media?.removeEventListener('change', syncMotion)
})
</script>

<template>
  <canvas
    ref="canvas"
    class="scene-canvas"
    :width="SCENE_W"
    :height="SCENE_H"
    role="img"
    :aria-label="model.scene.ariaLabel"
    data-test="scene-canvas"
  />
</template>

<style scoped>
.scene-canvas { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; image-rendering: pixelated; background: #10131b; }
</style>
