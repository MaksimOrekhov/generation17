<script setup lang="ts">
defineProps<{ label: string; value: number; color: string; delta?: { value: number; id: number } | null; good?: boolean }>()
</script>

<template>
  <div class="stat">
    <span class="stat__name">{{ label }}</span>
    <div class="stat__bar" role="progressbar" :aria-valuenow="Math.round(value)" aria-valuemin="0" aria-valuemax="100" :aria-label="label">
      <i :style="{ width: `${value}%`, '--c': color }" />
      <span v-if="delta" :key="delta.id" class="stat__delta" :class="{ 'stat__delta--bad': !good }">{{ delta.value > 0 ? '+' : '' }}{{ Math.round(delta.value) }}</span>
    </div>
    <b class="stat__value">{{ Math.round(value) }}</b>
  </div>
</template>

<style scoped>
.stat { display: grid; grid-template-columns: minmax(0, 96px) minmax(0, 1fr) 28px; gap: 8px; align-items: center; font-size: 13px; }
.stat__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-soft); }
.stat__bar { position: relative; height: 10px; background: #0f0d19; border: 1px solid var(--line); }
.stat__bar i {
  display: block; height: 100%;
  background: repeating-linear-gradient(90deg, var(--c) 0 5px, color-mix(in srgb, var(--c) 70%, #000) 5px 6px);
  transition: width .6s steps(12);
}
.stat__value { font: 500 12px var(--font-mono); text-align: right; }
.stat__delta { position: absolute; right: 0; top: -16px; font: 600 11px var(--font-mono); color: var(--good); animation: float 1.8s ease-out forwards; pointer-events: none; }
.stat__delta--bad { color: var(--bad); }
@keyframes float { 0% { opacity: 0; transform: translateY(6px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8px); } }
</style>
