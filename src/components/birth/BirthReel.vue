<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { sectors } from '../../domain/birth'

const props = defineProps<{ target: string }>()
const emit = defineEmits<{ done: [] }>()

const index = ref(0)
const landed = ref(false)
let timer = 0

const targetIndex = () => Math.max(0, sectors.findIndex(s => s.id === props.target))

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    index.value = targetIndex()
    landed.value = true
    emit('done')
    return
  }
  // медленно замедляющийся барабан, останавливается ровно на выпавшем секторе
  const total = sectors.length * 3 + targetIndex() - (index.value % sectors.length)
  let step = 0
  const next = () => {
    index.value = (index.value + 1) % sectors.length
    step++
    if (step >= total) {
      landed.value = true
      timer = window.setTimeout(() => emit('done'), 700)
      return
    }
    timer = window.setTimeout(next, 70 + Math.pow(step / total, 3) * 380)
  }
  timer = window.setTimeout(next, 300)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="reel" :class="{ 'reel--landed': landed }" role="status" aria-live="polite">
    <span class="reel__label">Корабль распределяет рождения</span>
    <div class="reel__window">
      <div class="reel__deck">{{ sectors[index]!.deck }}</div>
      <div class="reel__name">{{ sectors[index]!.name }}</div>
    </div>
    <div class="reel__dots"><i v-for="(s, i) in sectors" :key="s.id" :class="{ on: i === index }" /></div>
    <p class="reel__note">{{ landed ? 'Жребий брошен.' : 'Вы не выбираете, где родиться…' }}</p>
  </div>
</template>

<style scoped>
.reel { display: grid; justify-items: center; gap: 18px; padding: 48px 16px; text-align: center; }
.reel__label { font: 500 12px var(--font-mono); letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
.reel__window { min-width: min(420px, 100%); padding: 22px 28px; background: var(--panel); border: 2px solid var(--amber-dim); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--line), inset 0 0 40px #0008; }
.reel__deck { font: 600 64px/1 var(--font-display); color: var(--amber); letter-spacing: 3px; }
.reel__name { margin-top: 6px; font: 500 18px var(--font-ui); color: var(--text-soft); }
.reel--landed .reel__window { border-color: var(--amber); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--amber-dim), 0 0 40px #ffb34744; animation: land .5s steps(5); }
.reel__dots { display: flex; gap: 8px; }
.reel__dots i { width: 10px; height: 10px; background: var(--line); transition: background .1s; }
.reel__dots i.on { background: var(--amber); }
.reel__note { color: var(--muted); min-height: 1.5em; }
@keyframes land { 40% { transform: scale(1.04); } }
@media (max-width: 480px) { .reel__deck { font-size: 48px; } }
</style>
