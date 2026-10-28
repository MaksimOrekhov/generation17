<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { lifeStage, years } from '../../ui/format'
import ReportButton from '../common/ReportButton.vue'
import YearBar from './YearBar.vue'
import TransportControls from './TransportControls.vue'

defineEmits<{ help: []; newLife: [] }>()
const store = useGameStore()
const g = computed(() => store.game)
const status = computed(() => {
  if (g.value.stopped) return 'Жизнь завершена'
  if (store.hasDecision) return 'Время остановлено — нужно решение'
  if (store.currentMoment) return 'Происходит момент'
  return store.playing ? 'Время идёт' : 'Пауза'
})
</script>

<template>
  <header class="top">
    <div class="top__inner">
      <div class="top__row">
        <div class="top__brand">Поколение <b>17</b></div>
        <div class="top__clock">
          <div class="top__age">{{ years(g.age) }}</div>
          <div class="top__meta">
            <span>{{ g.protagonist.name }} · {{ lifeStage(g.age).toLowerCase() }}</span>
            <span>год полёта {{ g.shipYear }} · до цели {{ store.remaining }}</span>
          </div>
        </div>
        <div class="top__spacer" />
        <TransportControls class="top__transport" />
        <div class="top__menu">
          <ReportButton class="top__report" label="Отчёт" small />
          <button class="btn btn--sm btn--ghost" @click="$emit('help')">Как играть</button>
          <button class="btn btn--sm" @click="$emit('newLife')">Новая жизнь</button>
        </div>
      </div>
      <YearBar :progress="store.progress" />
    </div>
    <div class="top__status" :class="{ 'top__status--stop': store.hasDecision || g.stopped }" aria-live="polite">{{ status }}</div>
  </header>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 30; background: rgba(14, 12, 23, .96); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
.top__inner { max-width: 1400px; margin: 0 auto; padding: 14px 20px 10px; display: grid; gap: 11px; }
.top__row { display: flex; align-items: center; gap: 12px 18px; flex-wrap: wrap; }
.top__brand { font: 600 21px/1 var(--font-display); letter-spacing: .3px; color: var(--text); white-space: nowrap; }
.top__brand b { color: var(--amber); font-weight: 600; }
.top__clock { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.top__age { font: 600 28px/1 var(--font-display); color: var(--text); white-space: nowrap; }
.top__meta { display: grid; gap: 1px; font: 400 12px/1.3 var(--font-mono); color: var(--muted); min-width: 0; }
.top__meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.top__spacer { flex: 1; }
.top__menu { display: flex; gap: 6px; }
.top__status { max-width: 1400px; margin: 0 auto; padding: 0 20px 8px; font: 500 11px var(--font-mono); letter-spacing: .6px; color: var(--muted); text-transform: uppercase; }
.top__status--stop { color: var(--amber); }
@media (max-width: 720px) {
  /* на телефоне шапка не залипает: сцена и так занимает мало места */
  .top { position: relative; }
  .top__inner { padding: 12px; gap: 6px; }
  .top__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; }
  .top__brand { grid-area: 1 / 1; font-size: 18px; }
  .top__menu { grid-area: 1 / 2; }
  .top__menu .btn--ghost { display: none; } /* справка есть в подсказках */
  .top__clock { grid-area: 2 / 1 / 3 / 3; flex-wrap: wrap; row-gap: 0; }
  .top__age { font-size: 24px; }
  .top__transport { grid-area: 3 / 1 / 4 / 3; }
  .top__spacer { display: none; }
  .top__meta span:last-child { display: none; }
  .top__status { padding: 0 12px 8px; font-size: 10px; }
}
</style>
