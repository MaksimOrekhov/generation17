<script setup lang="ts">
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'
import PeerRow from '../common/PeerRow.vue'

const store = useGameStore()
</script>

<template>
  <Panel title="Родились в тот же год" aside="ровесники">
    <ul>
      <PeerRow v-for="p in store.game.peers" :key="p.id" :peer="p" :age="store.game.age" />
    </ul>
    <p class="peers__hint">Их жизни идут параллельно и закончатся тоже. В финале они будут показаны рядом с вашей.</p>
  </Panel>
</template>

<style scoped>
.peers__hint { padding: 8px 12px 10px; font-size: 12px; color: var(--faint); }
</style>
