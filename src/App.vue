<script setup lang="ts">
import { useGameStore } from './stores/game'
import BirthScreen from './components/birth/BirthScreen.vue'
import GameScreen from './components/GameScreen.vue'

const store = useGameStore()
</script>

<template>
  <GameScreen v-if="store.started" />
  <BirthScreen v-else :key="store.game.seed" />
</template>
