<script setup lang="ts">
import ModalShell from '../common/ModalShell.vue'

defineEmits<{ cancel: []; fresh: []; repeat: [] }>()
</script>

<template>
  <ModalShell label="Новая жизнь" tone="neutral" closable @close="$emit('cancel')">
    <div class="nl">
      <h2>Начать новую судьбу?</h2>
      <p>Текущее прохождение будет заменено в локальном сохранении. Новая жизнь начнётся с жребия рождения.</p>
      <div class="nl__actions">
        <button class="btn btn--primary" @click="$emit('fresh')">Новая судьба</button>
        <button class="btn" @click="$emit('repeat')">Тот же seed</button>
        <button class="btn btn--ghost" @click="$emit('cancel')">Отмена</button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.nl { padding: 22px 24px; display: grid; gap: 12px; }
.nl h2 { font: 600 24px/1.2 var(--font-display); }
.nl p { color: var(--text-soft); line-height: 1.6; }
.nl__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
</style>
