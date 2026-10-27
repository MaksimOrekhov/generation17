<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SCENE_H, SCENE_W, pickScene } from '../../render/scene'
import type { SceneModel } from '../../render/scene'

const props = defineProps<{ model: SceneModel }>()
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0

onMounted(() => {
  const ctx = canvas.value!.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const loop = (ts: number) => {
    pickScene(props.model).draw(ctx, ts / 1000, props.model)
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <canvas ref="canvas" class="scene-canvas" :width="SCENE_W" :height="SCENE_H" role="img" aria-label="Каюта: сцена из жизни героя" />
</template>

<style scoped>
.scene-canvas { width: 100%; height: auto; aspect-ratio: 16 / 9; image-rendering: pixelated; background: #000; }

/* Keep the complete cabin visible as a quiet atmospheric strip. */
.scene-canvas { height: clamp(150px, 25vw, 220px); aspect-ratio: auto; object-fit: contain; background: #100e1b; }
@media (max-width: 560px) { .scene-canvas { height: clamp(150px, 48vw, 200px); } }
</style>
