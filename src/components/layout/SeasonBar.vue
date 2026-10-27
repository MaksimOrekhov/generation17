<script setup lang="ts">
import { SEASON_NAMES } from '../../domain/clock'

defineProps<{ progress: number }>()
const fill = (i: number, p: number) => `${Math.max(0, Math.min(1, p * 4 - i)) * 100}%`
</script>

<template>
  <div class="seasons" role="progressbar" aria-label="Прогресс года" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
    <div v-for="(name, i) in SEASON_NAMES" :key="name" class="seasons__cell" :class="{ 'seasons__cell--now': Math.floor(progress * 4) === i }">
      <i :style="{ width: fill(i, progress) }" />
      <span>{{ name }}</span>
    </div>
  </div>
</template>

<style scoped>
.seasons { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.seasons__cell { position: relative; height: 14px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }
.seasons__cell i { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(90deg, var(--amber) 0 6px, var(--amber-2) 6px 8px); }
.seasons__cell span { position: absolute; left: 6px; top: 0; font: 500 9px/14px var(--font-mono); letter-spacing: 1px; text-transform: uppercase; color: var(--text); mix-blend-mode: difference; }
.seasons__cell--now { border-color: var(--amber-2); }
</style>
