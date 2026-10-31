<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { sectorById } from '../../domain/birth'
import { years } from '../../ui/format'
import ForkList from '../common/ForkList.vue'
import ReportButton from '../common/ReportButton.vue'
import ModalShell from '../common/ModalShell.vue'

defineEmits<{ close: []; newLife: []; repeat: [] }>()
const store = useGameStore()
const g = computed(() => store.game)
const decisions = computed(() => g.value.history.filter(h => h.kind === 'choice').length)
const moments = computed(() => g.value.history.filter(h => h.kind === 'moment').length)
const causeLabels: Record<string, string> = {
  'болезни раннего детства': 'Болезни раннего детства',
  'осложнений хронического заболевания': 'Осложнения хронического заболевания',
  'естественных причин': 'Естественные причины'
}
const causeLabel = computed(() => causeLabels[g.value.causeOfDeath ?? ''] ?? 'Причина не указана')
const hasKnownCause = computed(() => !!g.value.causeOfDeath && Object.hasOwn(causeLabels, g.value.causeOfDeath))
const peers = computed(() => g.value.peers.map(p => ({
  ...p,
  place: `${sectorById(p.sectorId).deck}`,
  fate: p.alive ? `жив(а), ${years(g.value.age)}` : `ушёл(ла) в ${years(p.diedAt ?? 0)}`
})))
</script>

<template>
  <ModalShell label="Последняя запись" tone="neutral" closable wide @close="$emit('close')">
    <div class="end__top"><span>Последняя запись</span><span>год полёта {{ g.shipYear }}</span></div>
    <div class="end__body">
      <h2 class="end__title">Конец одной жизни.<br><em>Не конец путешествия.</em></h2>
      <p class="end__fact">Жизнь завершилась: {{ years(g.age) }}.</p>
      <p v-if="hasKnownCause" class="end__fact">Категория причины смерти: {{ causeLabel }}.<small>Общая категория игровой модели, не медицинский диагноз.</small></p>
      <p v-else class="end__fact">Причина смерти не указана.<small>Общая категория игровой модели, не медицинский диагноз.</small></p>
      <p class="end__text">{{ store.finalText }}</p>
      <div class="end__numbers">
        <div><b>{{ g.age }}</b><span>прожитых лет</span></div>
        <div><b>{{ decisions }}</b><span>решений</span></div>
        <div><b>{{ moments }}</b><span>моментов</span></div>
        <div><b>{{ g.memories.length }}</b><span>воспоминаний</span></div>
      </div>
      <section v-if="g.forks.length">
        <h3 class="label-caps">Развилки жизни</h3>
        <p class="end__lead">Решения, которые отозвались в жизни. Что было бы на других путях, вы так и не узнаете.</p>
        <div class="end__forks"><ForkList :forks="g.forks" finished /></div>
      </section>
      <section v-if="g.age >= 5">
        <h3 class="label-caps">Ровесники</h3>
        <ul class="end__peers">
          <li v-for="p in peers" :key="p.id"><span class="wrap">{{ p.name }}<small> · {{ p.place }}</small></span><span>{{ p.fate }}</span></li>
        </ul>
      </section>
      <div class="end__actions">
        <button class="btn btn--primary" @click="$emit('newLife')">Прожить другую жизнь</button>
        <button class="btn" @click="$emit('repeat')">Тот же seed</button>
        <ReportButton label="Скопировать отчёт для тестера" />
        <button class="btn btn--ghost" @click="$emit('close')">Остаться в хронике</button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.end__top { display: flex; justify-content: space-between; gap: 12px; padding: 9px 16px; background: var(--panel-2); color: var(--muted); font: 600 11px/1.2 var(--font-mono); letter-spacing: 1.2px; text-transform: uppercase; border-bottom: 2px solid var(--line); }
.end__body { padding: 22px 24px 24px; display: grid; gap: 18px; }
.end__title { font: 600 32px/1.15 var(--font-display); }
.end__title em { color: var(--amber); font-style: normal; }
.end__text { font-size: 15.5px; line-height: 1.65; color: var(--text-soft); max-width: 62ch; }
.end__fact { font-size: 14px; line-height: 1.5; color: var(--text); }
.end__fact small { display: block; color: var(--muted); font-size: 12px; }
.end__numbers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.end__numbers div { padding: 10px 12px; background: var(--bg-2); border: 1px solid var(--line); display: grid; gap: 2px; }
.end__numbers b { font: 600 28px/1 var(--font-display); color: var(--amber); }
.end__numbers span { font-size: 12px; color: var(--muted); }
.end__lead { margin: 6px 0 10px; font-size: 13px; color: var(--muted); }
.end__forks { max-height: 340px; overflow: auto; padding-right: 4px; }
.end__peers { margin-top: 8px; display: grid; }
.end__peers li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.end__peers small { color: var(--faint); }
.end__actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 560px) {
  .end__numbers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .end__title { font-size: 25px; }
  .end__body { padding: 16px; }
}
</style>
