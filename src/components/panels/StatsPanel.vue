<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Stat } from '../../domain/types'
import { useGameStore } from '../../stores/game'
import { statLabels } from '../../ui/format'
import Panel from '../common/Panel.vue'
import StatBar from '../common/StatBar.vue'

const store = useGameStore()
const deltas = reactive<Partial<Record<Stat, { value: number; id: number }>>>({})
let counter = 0

// показываем всплывающие «+3» только при изменениях внутри одной жизни
watch(() => store.game.stats, (next, prev) => {
  if (!prev || store.game.age === 0 && store.game.history.length < 2) return
  for (const { key } of statLabels) {
    const d = next[key] - prev[key]
    if (Math.abs(d) >= 1) deltas[key] = { value: d, id: ++counter }
  }
})
watch(() => store.game.seed, () => {
  for (const k of Object.keys(deltas)) delete deltas[k as Stat]
})
</script>

<template>
  <Panel title="Состояние" aside="0–100">
    <div class="stats">
      <StatBar
        v-for="s in statLabels" :key="s.key" :label="s.name" :value="store.game.stats[s.key]" :color="s.color"
        :delta="deltas[s.key]" :good="s.negative ? (deltas[s.key]?.value ?? 0) < 0 : (deltas[s.key]?.value ?? 0) > 0"
      />
      <p class="stats__hint">Показатели меняют шансы, но не определяют исход.</p>
    </div>
  </Panel>
</template>

<style scoped>
.stats { display: grid; gap: 11px; padding: 14px 12px 12px; }
.stats__hint { font-size: 12px; color: var(--faint); margin-top: 2px; }
</style>
