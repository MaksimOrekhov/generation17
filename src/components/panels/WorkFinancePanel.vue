<script setup lang="ts">
import { computed, ref } from 'vue'
import { workFinanceView } from '../../domain/economyView'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'
import WealthPips from '../common/WealthPips.vue'

const store = useGameStore()
// Игра иммутабельна (shallowRef): панель пересчитывается при каждой замене состояния, в том числе после загрузки сохранения.
const view = computed(() => workFinanceView(store.game))
// На телефоне свёрнуты все строки, кроме статуса, накоплений и предупреждения.
const open = ref(false)
</script>

<template>
  <Panel title="Работа и финансы" :aside="view.aside">
    <div class="wf" :class="`wf--${view.stage}`" :data-open="open || undefined">
      <p class="wf__title wrap">{{ view.title }}</p>
      <p
        v-for="(line, i) in view.lines" :key="line"
        class="wf__line wrap" :class="{ 'wf__x': view.savings !== null || i > 0 }"
      >{{ line }}</p>
      <p v-if="view.family !== null" class="wf__row wf__x">
        <span class="wf__label">Достаток семьи</span>
        <span class="wf__value wf__pips"><WealthPips :wealth="view.family" :size="8" /></span>
      </p>
      <p v-if="view.savings" class="wf__savings">
        <span class="wf__label">{{ view.savings.label }}</span>
        <b class="wf__money">{{ view.savings.text }}</b>
      </p>
      <p v-for="row in view.rows" :key="row.key" class="wf__row wf__x" :class="row.key === 'forecast' && view.forecast ? `wf__row--${view.forecast.direction}` : undefined">
        <span class="wf__label">{{ row.label }}</span>
        <span class="wf__value">{{ row.value }}</span>
      </p>
      <p v-if="view.forecast" class="wf__caption wf__x" :title="view.forecast.assumptions.join(' ')">{{ view.forecast.caption }}</p>
      <p v-if="view.runway" class="wf__line wf__x">{{ view.runway }}</p>
      <p v-if="view.notice" class="wf__notice wrap" :class="`wf__notice--${view.notice.level}`" role="status">{{ view.notice.text }}</p>
      <button
        v-if="view.spendOffered" type="button" class="btn btn--accent wf__spend"
        :disabled="!store.canOpenShop" @click="store.openShop()"
      >Траты и карьера</button>
      <button v-if="view.savings || view.lines.length > 1" type="button" class="wf__toggle" :aria-expanded="open" @click="open = !open">
        {{ open ? 'Свернуть' : 'Подробнее' }}
      </button>
    </div>
  </Panel>
</template>

<style scoped>
.wf { display: grid; gap: 5px; padding: 12px 14px 13px; min-width: 0; }
.wf p { margin: 0; min-width: 0; }
.wf__title { font: 600 15px/1.3 var(--font-ui); color: var(--text); }
.wf__line { font-size: 12.5px; line-height: 1.4; color: var(--muted); }
.wf__row, .wf__savings { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 4px 12px; }
.wf__label { font-size: 12.5px; color: var(--muted); }
.wf__value { min-width: 0; text-align: right; font: 500 12.5px/1.4 var(--font-mono); color: var(--text-soft); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.wf__pips { color: var(--amber); }
.wf__savings { margin: 4px 0 3px; padding: 8px 10px; background: var(--bg-2); border: 1px solid var(--line); }
.wf__money { min-width: 0; text-align: right; font: 600 19px/1.2 var(--font-mono); color: var(--amber); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
/* прогноз различается цветом очень мягко и дублируется знаком в тексте («+», «−») */
.wf__row--up .wf__value { color: var(--good); }
.wf__row--down .wf__value { color: var(--bad); }
.wf__caption { font-size: 11px; line-height: 1.35; color: var(--faint); }
.wf__notice { margin-top: 2px; padding: 5px 8px; font-size: 12px; line-height: 1.4; border-left: 2px solid var(--line-2); color: var(--text-soft); background: var(--bg-2); }
.wf__notice--warn { border-left-color: var(--amber-2); color: var(--amber); }
.wf__spend { justify-self: stretch; margin-top: 4px; padding: 8px 12px; font-size: 14px; min-height: 40px; }
.wf__spend:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.wf__toggle { display: none; justify-self: start; margin-top: 2px; padding: 4px 0; font: 500 11px/1.2 var(--font-mono); letter-spacing: .6px; text-transform: uppercase; color: var(--muted); background: none; border: 0; cursor: pointer; }
.wf__toggle:hover { color: var(--text); }
.wf__toggle:focus-visible { outline: 1px solid var(--amber); outline-offset: 2px; }

@media (max-width: 820px) {
  .wf { gap: 4px; padding: 10px 12px; }
  .wf__money { font-size: 17px; }
  .wf__x { display: none; }
  .wf[data-open] .wf__x { display: grid; }
  .wf[data-open] p.wf__line.wf__x, .wf[data-open] p.wf__caption.wf__x { display: block; }
  .wf__toggle { display: block; }
}
</style>
