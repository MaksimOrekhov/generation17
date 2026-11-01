<script setup lang="ts">
import { useGameStore } from '../../stores/game'
import ForkList from '../common/ForkList.vue'
import Panel from '../common/Panel.vue'

const store = useGameStore()
</script>

<template>
  <Panel v-if="store.game.forks.length" id="life-forks" tabindex="-1" aria-label="Развилки" title="Развилки" :aside="String(store.game.forks.length)">
    <div class="forks-panel">
      <ForkList :forks="[...store.game.forks].reverse()" :finished="store.game.stopped" />
    </div>
  </Panel>
</template>

<style scoped>
.forks-panel { padding: 12px; max-height: 420px; overflow: auto; }
</style>
