<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { drawPortrait } from '../../render/people'

const props = withDefaults(defineProps<{ name: string; age: number; width?: number }>(), { width: 40 })
const canvas = ref<HTMLCanvasElement | null>(null)

function paint() {
  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  ctx.imageSmoothingEnabled = false
  drawPortrait(ctx, c.width, c.height, props.name, props.age)
}

onMounted(paint)
// портрет меняется только на стыках возрастов (волосы седеют, появляются морщины)
watch(() => [props.name, props.age < 3, props.age < 13, props.age >= 38, props.age >= 48, props.age >= 55, props.age >= 62], paint)
</script>

<template>
  <canvas ref="canvas" class="portrait" width="40" height="48" :style="{ width: `${width}px`, height: `${width * 1.2}px` }" role="img" :aria-label="`Портрет: ${name}`" />
</template>

<style scoped>
.portrait { image-rendering: pixelated; border: 2px solid var(--ink); background: #2a2236; flex: none; }
</style>
