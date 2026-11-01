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
.panel { scroll-margin-top: 84px; position: relative; min-width: 0; background: var(--panel); border: 1px solid var(--line); }
.panel__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 11px 14px; border-bottom: 1px solid var(--line); min-height: 44px; }
.panel__title { display: flex; align-items: center; gap: 9px; color: var(--text); font: 600 17px/1.2 var(--font-display); }
/* пиксельный маркер у названия: единственный «корабельный» акцент панели */
.panel__title::before { content: ''; flex: none; width: 7px; height: 7px; background: var(--amber); box-shadow: 3px 3px 0 var(--amber-dim); }
.panel__aside { font: 500 11px/1.2 var(--font-mono); letter-spacing: .6px; color: var(--muted); text-align: right; overflow-wrap: anywhere; }
.panel:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }
</style>
