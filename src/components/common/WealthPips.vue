<script setup lang="ts">
defineProps<{ wealth: number; size?: number }>()
</script>

<template>
  <span class="pips" role="img" :aria-label="`Достаток ${wealth} из 5`" :style="{ '--s': `${size ?? 9}px` }">
    <i v-for="n in 5" :key="n" :class="{ on: n <= wealth }" />
  </span>
</template>

<style scoped>
.pips { display: inline-flex; gap: calc(var(--s) * .45); vertical-align: middle; }
.pips i { width: var(--s); height: var(--s); border-radius: 50%; border: 1.5px solid currentColor; opacity: .45; box-sizing: border-box; }
.pips i.on { background: currentColor; opacity: 1; }
</style>
