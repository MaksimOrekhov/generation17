<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { shipLabels } from '../../ui/format'
import Panel from '../common/Panel.vue'
import StatBar from '../common/StatBar.vue'

const store = useGameStore()
const reports = computed(() => store.game.history.filter(h => h.kind === 'ship').slice(0, 3))
const route = computed(() => `${Math.min(100, store.game.shipYear / 340 * 100)}%`)
</script>

<template>
  <Panel title="Корабль" :aside="`год ${store.game.shipYear}`">
    <div class="ship">
      <div class="ship__route" :aria-label="`До цели ${store.remaining} лет`">
        <span>Земля</span>
        <div class="ship__line"><i :style="{ left: route }" /></div>
        <span>Цель</span>
      </div>
      <StatBar v-for="s in shipLabels" :key="s.key" :label="s.name" :value="store.game.ship[s.key]" :color="s.color" />
      <p class="ship__hint">Показатели условные и приходят «по сообщениям» корабля.</p>
    </div>
    <div class="news">
      <h4 class="label-caps">Бортовая сводка</h4>
      <template v-if="reports.length">
        <article v-for="r in reports" :key="r.id" class="news__item">
          <small>год {{ r.shipYear }}</small>
          <b>{{ r.title }}</b>
          <p>{{ r.text }}</p>
        </article>
      </template>
      <p v-else class="news__empty">Бортовые службы не сообщают о значимых событиях. Обычная жизнь большого корабля продолжается.</p>
    </div>
  </Panel>
</template>

<style scoped>
.ship { display: grid; gap: 11px; padding: 14px 12px 10px; }
.ship__route { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; font: 500 10px var(--font-mono); letter-spacing: 1px; text-transform: uppercase; color: var(--faint); }
.ship__line { position: relative; height: 2px; background: var(--line-2); }
.ship__line i { position: absolute; top: -4px; width: 10px; height: 10px; margin-left: -5px; background: var(--amber); box-shadow: 0 0 10px var(--amber); }
.ship__hint { font-size: 12px; color: var(--faint); }
.news { display: grid; gap: 10px; padding: 12px; border-top: 2px solid var(--line); }
.news__item { padding-left: 10px; border-left: 2px solid var(--amber-dim); display: grid; }
.news__item small { font: 400 10px var(--font-mono); color: var(--faint); text-transform: uppercase; letter-spacing: 1px; }
.news__item b { font-weight: 500; font-size: 13px; }
.news__item p, .news__empty { font-size: 12.5px; color: var(--muted); }
</style>
