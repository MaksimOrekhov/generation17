<script setup lang="ts">
import type { SectorOption } from '../../domain/offers'

defineProps<{ options: SectorOption[]; selected: string | null }>()
defineEmits<{ select: [id: SectorOption['id']] }>()
</script>

<template>
  <div class="pick" role="radiogroup" aria-label="Направление экскурсии">
    <button
      v-for="o in options" :key="o.id" type="button" role="radio" class="pick__opt"
      :aria-checked="selected === o.id" :data-sector="o.id" @click="$emit('select', o.id)"
    >
      <span class="pick__name">{{ o.name }}</span>
      <span class="pick__meta">палуба {{ o.deck }}</span>
    </button>
  </div>
</template>

<style scoped>
.pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.pick__opt { display: grid; gap: 2px; min-height: 48px; padding: 8px 12px; text-align: left; color: var(--text-soft); background: var(--panel); border: 2px solid var(--line); cursor: pointer; min-width: 0; }
.pick__opt:hover { border-color: var(--line-2); }
.pick__opt[aria-checked='true'] { border-color: var(--amber); background: var(--amber-dim); color: var(--text); }
.pick__opt:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.pick__name { font: 600 13.5px/1.3 var(--font-ui); overflow-wrap: anywhere; }
.pick__meta { font: 500 11.5px/1.3 var(--font-mono); color: var(--muted); }
</style>
