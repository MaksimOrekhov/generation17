<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LogKind } from '../../domain/types'
import { useGameStore } from '../../stores/game'
import type { LogFilter } from '../../stores/game'
import { logKindLabels } from '../../ui/format'
import Panel from '../common/Panel.vue'

const PAGE = 80
const store = useGameStore()
const limit = ref(PAGE)
const filters: { id: LogFilter; name: string }[] = [
  { id: 'all', name: 'Всё' }, { id: 'choice', name: 'Решения' }, { id: 'moment', name: 'Моменты' },
  { id: 'ship', name: 'Корабль' }, { id: 'memory', name: 'Память' }, { id: 'ambient', name: 'Фон' }
]
const shown = computed(() => store.latest.slice(0, limit.value))
const kindClass = (k: LogKind) => `entry--${k}`

watch(() => store.filter, () => { limit.value = PAGE })
watch(() => store.game.seed, () => { limit.value = PAGE })
</script>

<template>
  <Panel title="Летопись жизни" :aside="`записей: ${store.game.history.length}`">
    <nav class="chron__filters" aria-label="Фильтр летописи">
      <button v-for="f in filters" :key="f.id" class="btn btn--sm btn--ghost" :aria-pressed="store.filter === f.id" @click="store.filter = f.id">{{ f.name }}</button>
    </nav>
    <div class="chron__list">
      <article v-for="e in shown" :key="e.id" class="entry" :class="kindClass(e.kind)">
        <time class="entry__age">{{ e.age }}<small>л</small></time>
        <div class="entry__main">
          <h4 class="entry__title wrap">
            <span v-if="e.kind !== 'ambient' && e.kind !== 'life'" class="entry__kind">{{ logKindLabels[e.kind] }}</span>
            {{ e.title }}
          </h4>
          <p class="entry__text wrap">{{ e.text }}</p>
        </div>
      </article>
      <p v-if="!shown.length" class="chron__empty">В этой категории пока нет записей.</p>
      <button v-if="store.latest.length > limit" class="btn btn--sm chron__more" @click="limit += PAGE">Показать ещё</button>
    </div>
  </Panel>
</template>

<style scoped>
.chron__filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 2px solid var(--line); }
.chron__list { max-height: 560px; overflow: auto; }
.entry { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.entry__age { font: 600 15px/1.3 var(--font-display); color: var(--amber); }
.entry__age small { font: 400 10px var(--font-mono); color: var(--faint); margin-left: 2px; }
.entry__title { font-size: 13.5px; font-weight: 600; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.entry__kind { font: 500 9.5px var(--font-mono); letter-spacing: 1px; text-transform: uppercase; padding: 1px 5px; background: var(--panel-2); color: var(--muted); }
.entry__text { margin-top: 2px; font-size: 13.5px; color: var(--text-soft); }
.entry--choice .entry__title { color: var(--amber); }
.entry--choice .entry__kind { background: var(--amber-dim); color: #ffd9a0; }
.entry--moment .entry__kind { background: #3b2a12; color: var(--amber); }
.entry--ship .entry__title { color: var(--cool); }
.entry--memory { background: #1b1730; }
.entry--memory .entry__title::before { content: '★'; color: var(--amber); }
.entry--ambient { padding-block: 7px; }
.entry--ambient .entry__title { font-weight: 500; color: var(--muted); font-size: 12px; }
.entry--ambient .entry__text { font-style: italic; color: var(--muted); font-size: 13px; }
.entry--ambient .entry__age { color: var(--faint); font-size: 13px; }
.chron__empty { padding: 16px 12px; color: var(--muted); }
.chron__more { margin: 10px 12px 12px; }
</style>
