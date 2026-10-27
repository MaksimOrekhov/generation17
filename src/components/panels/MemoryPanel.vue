<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'

const store = useGameStore()
const items = computed(() => store.game.memories.slice(-5).reverse())
</script>

<template>
  <Panel title="Личная память" :aside="String(store.game.memories.length)">
    <ul v-if="items.length" class="memory">
      <li v-for="(m, i) in items" :key="i" class="wrap">{{ m }}</li>
    </ul>
    <p v-else class="memory__empty">Самые важные воспоминания этой жизни ещё впереди.</p>
  </Panel>
</template>

<style scoped>
.memory { display: grid; gap: 8px; padding: 12px; }
.memory li { position: relative; padding-left: 16px; font-size: 13px; color: var(--text-soft); }
.memory li::before { content: '★'; position: absolute; left: 0; color: var(--amber); font-size: 10px; top: 3px; }
.memory__empty { padding: 12px; font-size: 13px; color: var(--muted); }
</style>
