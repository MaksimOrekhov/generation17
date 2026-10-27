<script setup lang="ts">
import type { Fork } from '../../domain/types'

defineProps<{ forks: Fork[]; finished?: boolean }>()
</script>

<template>
  <ol class="forks">
    <li v-for="f in forks" :key="f.arc + f.age" class="fork">
      <header class="fork__head">
        <span class="fork__age">{{ f.age }} л</span>
        <h4 class="fork__title wrap">{{ f.title }}</h4>
      </header>
      <p class="fork__chosen wrap"><small>Выбрано</small>{{ f.chosen }}</p>
      <p class="fork__others wrap"><small>Другие пути</small>{{ f.others.join(' · ') }}</p>
      <ul v-if="f.outcomes.length" class="fork__outcomes">
        <li v-for="o in f.outcomes" :key="o.age + o.title" class="wrap">
          <b>{{ o.age }} л · {{ o.title }}</b>
          <span>{{ o.chosen }}</span>
        </li>
      </ul>
      <p v-else class="fork__none">{{ finished ? 'Эта развилка так и не отозвалась в жизни.' : 'Последствия ещё впереди.' }}</p>
    </li>
  </ol>
</template>

<style scoped>
.forks { display: grid; gap: 12px; }
.fork { display: grid; gap: 4px; padding: 10px 12px; background: var(--bg-2); border: 1px solid var(--line); border-left: 3px solid var(--amber-dim); }
.fork__head { display: flex; align-items: baseline; gap: 10px; }
.fork__age { font: 600 13px var(--font-mono); color: var(--amber); }
.fork__title { font: 600 16px/1.25 var(--font-display); }
.fork p { font-size: 13px; line-height: 1.45; }
.fork small { display: block; font: 500 9.5px var(--font-mono); letter-spacing: 1px; text-transform: uppercase; color: var(--faint); }
.fork__chosen { color: var(--text); }
.fork__others { color: var(--faint); font-style: italic; }
.fork__outcomes { display: grid; gap: 6px; margin-top: 4px; padding-left: 10px; border-left: 2px solid var(--amber-dim); }
.fork__outcomes li { display: grid; font-size: 13px; color: var(--text-soft); }
.fork__outcomes b { font-weight: 600; color: var(--cool); font-size: 12.5px; }
.fork__none { color: var(--faint); font-size: 12.5px; }
</style>
