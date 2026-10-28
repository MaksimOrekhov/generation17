<script setup lang="ts">
import type { FamilyParticipantOption } from '../../domain/offers'

const props = defineProps<{ options: FamilyParticipantOption[]; selected: readonly string[]; max: number }>()
defineEmits<{ toggle: [id: string] }>()
const locked = (id: string) => !props.selected.includes(id) && props.selected.length >= props.max
</script>

<template>
  <div class="pick" role="group" aria-label="Участники поездки">
    <button
      v-for="o in options" :key="o.id" type="button" role="checkbox" class="pick__opt"
      :aria-checked="selected.includes(o.id)" :disabled="locked(o.id)" :data-person="o.id" @click="$emit('toggle', o.id)"
    >
      <span class="pick__name">{{ o.name }}</span>
      <span class="pick__meta">{{ o.role }} · близость {{ o.bond }}</span>
    </button>
  </div>
</template>

<style scoped>
.pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
.pick__opt { display: grid; gap: 2px; min-height: 48px; padding: 8px 12px; text-align: left; color: var(--text-soft); background: var(--panel); border: 2px solid var(--line); cursor: pointer; min-width: 0; }
.pick__opt:hover:not(:disabled) { border-color: var(--line-2); }
.pick__opt:disabled { opacity: .45; cursor: not-allowed; }
.pick__opt[aria-checked='true'] { border-color: var(--amber); background: var(--amber-dim); color: var(--text); }
.pick__opt[aria-checked='true'] .pick__name::before { content: '✓ '; color: var(--amber); }
.pick__opt:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.pick__name { font: 600 13.5px/1.3 var(--font-ui); overflow-wrap: anywhere; }
.pick__meta { font: 500 11.5px/1.3 var(--font-mono); color: var(--muted); overflow-wrap: anywhere; }
</style>
