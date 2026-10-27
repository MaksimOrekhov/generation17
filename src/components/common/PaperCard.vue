<script setup lang="ts">
defineProps<{ label: string; code: string; footer?: string }>()
</script>

<template>
  <article class="paper">
    <header class="paper__head">
      <span class="paper__tab">{{ label }}</span>
      <span class="paper__tab">{{ code }}</span>
    </header>
    <div class="paper__body"><slot /></div>
    <footer v-if="footer" class="paper__mrz" aria-hidden="true">{{ footer }}</footer>
    <slot name="stamp" />
  </article>
</template>

<style scoped>
.paper { position: relative; background: var(--paper); color: var(--ink); border: 2px solid var(--paper-line); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--line); overflow: hidden; }
.paper__head {
  display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 10px; height: 24px;
  background: repeating-linear-gradient(135deg, var(--amber) 0 8px, #e39b2f 8px 16px);
  border-bottom: 2px solid #b9852a;
  font: 600 10px/1 var(--font-mono); letter-spacing: 1.4px; text-transform: uppercase; color: #3b2608;
}
.paper__tab { background: var(--amber); padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.paper__body { padding: 12px; min-width: 0; }
.paper__mrz {
  padding: 6px 12px; background: var(--paper-2); border-top: 2px solid var(--paper-line);
  font: 400 10px/1.35 var(--font-mono); letter-spacing: 1.2px; color: var(--ink-soft);
  white-space: nowrap; overflow: hidden; text-overflow: clip;
}
</style>
