<script setup lang="ts">
defineProps<{ title: string; aside?: string }>()
</script>

<template>
  <section class="panel">
    <header class="panel__head">
      <h3 class="panel__title">{{ title }}</h3>
      <span v-if="aside" class="panel__aside">{{ aside }}</span>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.panel { position: relative; min-width: 0; background: var(--panel); border: 2px solid var(--line); }
.panel::before, .panel::after { content: ''; position: absolute; width: 6px; height: 6px; background: var(--amber-dim); pointer-events: none; }
.panel::before { left: -2px; top: -2px; }
.panel::after { right: -2px; bottom: -2px; }
.panel__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; border-bottom: 2px solid var(--line); min-height: 34px; }
.panel__title { font: 500 11px/1.2 var(--font-mono); letter-spacing: 1.4px; text-transform: uppercase; color: var(--muted); }
.panel__aside { font: 500 11px/1.2 var(--font-mono); letter-spacing: .6px; color: var(--amber); text-align: right; overflow-wrap: anywhere; }
</style>
