<script setup lang="ts">
import { SPEEDS } from '../../domain/clock'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const label = (s: number) => `${s === .5 ? '0.5' : s}×`
</script>

<template>
  <div class="transport">
    <button class="btn btn--primary transport__play" :disabled="store.blocked" @click="store.togglePlay()">
      {{ store.playing ? '❚❚ Пауза' : '▶ Играть' }}
    </button>
    <div class="transport__speeds" role="group" aria-label="Скорость">
      <button v-for="s in SPEEDS" :key="s" class="btn btn--sm" :aria-pressed="store.speed === s" @click="store.changeSpeed(s)">{{ label(s) }}</button>
    </div>
    <button class="btn btn--sm" :disabled="store.blocked" title="Прожить остаток года (→)" @click="store.step()">+1 год</button>
    <button class="btn btn--sm btn--accent" :disabled="store.blocked" @click="store.runToDecision()">До решения »</button>
  </div>
</template>

<style scoped>
.transport { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.transport__play { min-width: 104px; }
.transport__speeds { display: flex; gap: 4px; flex-wrap: wrap; }
@media (max-width: 720px) {
  .transport { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .transport > *, .transport__speeds button { flex: none; }
  .transport__speeds { flex-wrap: nowrap; }
  .transport__play { min-width: 92px; }
}

.transport { gap: 6px; }
.transport__speeds { padding: 3px; gap: 2px; background: var(--bg-2); border: 1px solid var(--line); }
.transport__speeds .btn { min-width: 38px; box-shadow: none; border-color: transparent; background: transparent; }
.transport__speeds .btn[aria-pressed='true'] { background: var(--amber); border-color: var(--amber); }
@media (max-width: 720px) {
  .transport { flex-wrap: wrap; overflow: visible; }
  .transport__speeds { flex-wrap: wrap; }
}

</style>
