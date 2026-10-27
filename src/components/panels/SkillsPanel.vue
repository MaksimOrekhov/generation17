<script setup lang="ts">
import { useGameStore } from '../../stores/game'
import { skillLabels } from '../../ui/format'
import Panel from '../common/Panel.vue'

const store = useGameStore()
</script>

<template>
  <Panel title="Навыки" :aside="store.game.age < 16 ? 'раскрываются с 16 лет' : store.game.protagonist.job">
    <ul class="skills">
      <li v-for="s in skillLabels" :key="s.key" class="skills__row">
        <span>{{ s.name }}</span>
        <b>{{ Math.round(store.game.skills[s.key]) }}</b>
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.skills { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 12px; }
.skills__row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 8px; font-size: 12.5px; color: var(--muted); background: var(--bg-2); border: 1px solid var(--line); }
.skills__row b { font: 500 12px var(--font-mono); color: var(--text); }
</style>
