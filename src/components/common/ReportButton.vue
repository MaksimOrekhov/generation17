<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../../stores/game'
import { buildReport } from '../../ui/report'

withDefaults(defineProps<{ label?: string; small?: boolean }>(), { label: 'Отчёт для тестера', small: false })
const store = useGameStore()
const state = ref<'idle' | 'done' | 'failed'>('idle')

async function copy() {
  const text = buildReport(store.game, store.playedSeconds, store.preset)
  try {
    await navigator.clipboard.writeText(text)
    state.value = 'done'
  } catch {
    // запасной путь для окон без доступа к буферу обмена
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    state.value = document.execCommand('copy') ? 'done' : 'failed'
    area.remove()
  }
  setTimeout(() => { state.value = 'idle' }, 2500)
}
</script>

<template>
  <button class="btn" :class="{ 'btn--sm': small }" :title="'Скопировать текст отчёта о жизни и вопросы для тестера'" @click="copy">
    {{ state === 'done' ? 'Скопировано ✓' : state === 'failed' ? 'Не удалось скопировать' : label }}
  </button>
</template>
