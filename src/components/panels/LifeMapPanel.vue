<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'

const CELLS = 100
const store = useGameStore()
const cells = computed(() => {
  const g = store.game
  const decided = new Set(g.history.filter(h => h.kind === 'choice').map(h => h.age))
  return Array.from({ length: CELLS }, (_, age) => {
    const mood = g.moodByAge[age]
    return {
      age,
      lived: age < g.age || (g.stopped && age === g.age),
      current: age === g.age && !g.stopped,
      end: age === g.birth.lifeExpectancy,
      decision: decided.has(age),
      // от тёмной меди (несчастный год) до яркого янтаря (счастливый)
      color: mood === undefined ? undefined : `hsl(${28 + mood * .22} ${40 + mood * .45}% ${22 + mood * .36}%)`
    }
  })
})
</script>

<template>
  <Panel title="Карта жизни" aside="1 клетка = 1 год">
    <div class="map" role="img" :aria-label="`Прожито лет: ${store.game.age}`">
      <i
        v-for="c in cells" :key="c.age" class="map__cell"
        :class="{ 'map__cell--lived': c.lived, 'map__cell--now': c.current, 'map__cell--end': c.end, 'map__cell--decision': c.decision }"
        :style="c.lived && c.color ? { background: c.color } : undefined" :title="`${c.age} лет`"
      />
    </div>
    <p class="map__legend">Чем ярче клетка, тем лучше был год. Точка — решение. Пунктир — ожидаемая длина жизни ({{ store.game.birth.lifeExpectancy }}) при вашем достатке.</p>
  </Panel>
</template>

<style scoped>
.map { display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; padding: 12px; }
.map__cell { position: relative; aspect-ratio: 1; background: var(--bg-2); border: 1px solid var(--line); }
.map__cell--lived { border-color: transparent; }
.map__cell--now { outline: 2px solid var(--amber); outline-offset: 1px; animation: blink 1.2s steps(2) infinite; }
.map__cell--end { border: 1px dashed var(--amber-2); }
.map__cell--decision::after { content: ''; position: absolute; inset: 35%; background: #fff2cf; }
.map__legend { padding: 0 12px 12px; font-size: 12px; color: var(--faint); }
@keyframes blink { 50% { outline-color: transparent; } }
</style>
