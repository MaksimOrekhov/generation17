<script setup lang="ts">
defineProps<{ progress: number }>()
</script>

<template>
  <div class="year" role="progressbar" aria-label="Прогресс года" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
    <i :style="{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }" />
  </div>
</template>

<style scoped>
.year { position: relative; height: 8px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }
.year i { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(90deg, var(--amber) 0 6px, var(--amber-2) 6px 8px); }
</style>
