<script setup lang="ts">
import type { ProfessionOption, RetrainForecast } from '../../domain/spendView'
import type { Job } from '../../domain/types'

defineProps<{ options: ProfessionOption[]; selected: Job | null; forecast: RetrainForecast | null }>()
defineEmits<{ select: [job: Job] }>()
</script>

<template>
  <div class="prof">
    <div class="prof__opts" role="radiogroup" aria-label="Новая специальность">
      <button
        v-for="o in options" :key="o.job" type="button" role="radio" class="prof__opt"
        :aria-checked="selected === o.job" :data-job="o.job" @click="$emit('select', o.job)"
      >
        <span class="prof__name">{{ o.job }}</span>
        <span class="prof__meta">{{ o.skillName }} {{ o.skillNow }} → {{ o.skillAfter }} · {{ o.tariffText }}</span>
        <span class="prof__note">{{ o.note }}</span>
      </button>
    </div>

    <section v-if="forecast" class="prof__fc" aria-label="Сравнение до и после переобучения" data-test="retrain-forecast">
      <p v-if="forecast.hypothetical" class="prof__hyp">Пока не хватает средств или личного времени: сравнение показано так, будто взнос уже оплачен.</p>
      <table class="prof__table">
        <thead><tr><th scope="col"><span class="sr">Показатель</span></th><th scope="col">Сейчас</th><th scope="col">После перехода</th></tr></thead>
        <tbody>
          <tr v-for="r in forecast.rows" :key="r.label" :class="{ 'prof__row--same': r.now === r.after }">
            <th scope="row">{{ r.label }}</th><td data-label="Сейчас">{{ r.now }}</td><td data-label="После перехода">{{ r.after }}</td>
          </tr>
        </tbody>
      </table>
      <p class="prof__cost">{{ forecast.costText }}</p>
      <p class="prof__line" data-test="retrain-gap">{{ forecast.payGapText }}</p>
      <p v-for="line in forecast.timeline" :key="line" class="prof__line">{{ line }}</p>
      <p v-if="forecast.pathText" class="prof__line">{{ forecast.pathText }}</p>
      <p v-for="n in forecast.notes" :key="n" class="prof__line">{{ n }}</p>
      <p class="prof__cap">{{ forecast.caption }}</p>
    </section>
  </div>
</template>

<style scoped>
.prof { display: grid; gap: 10px; min-width: 0; }
.prof p { margin: 0; }
.prof__opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
.prof__opt { display: grid; gap: 3px; min-height: 48px; padding: 9px 12px; text-align: left; color: var(--text-soft); background: var(--panel); border: 2px solid var(--line); cursor: pointer; min-width: 0; }
.prof__opt:hover { border-color: var(--line-2); }
.prof__opt[aria-checked='true'] { border-color: var(--amber); background: var(--amber-dim); color: var(--text); }
.prof__opt:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.prof__name { font: 600 14px/1.3 var(--font-ui); }
.prof__meta { font: 500 11.5px/1.35 var(--font-mono); color: var(--amber); overflow-wrap: anywhere; }
.prof__note { font-size: 12px; line-height: 1.4; color: var(--muted); overflow-wrap: anywhere; }
.prof__fc { display: grid; gap: 6px; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); min-width: 0; }
.prof__hyp { font-size: 12.5px; line-height: 1.45; color: var(--cool); }
.prof__table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12.5px; }
.prof__table th, .prof__table td { padding: 6px 4px; text-align: right; border-bottom: 1px solid var(--line); overflow-wrap: break-word; vertical-align: top; }
.prof__table thead th { font: 500 11px var(--font-mono); color: var(--muted); }
.prof__table tbody th { text-align: left; font-weight: 500; color: var(--muted); width: 36%; }
.prof__table td { font-family: var(--font-mono); color: var(--text); font-variant-numeric: tabular-nums; }
.prof__table td:last-child { color: var(--amber); }
.prof__row--same td:last-child { color: var(--text); }
.prof__cost { font: 600 13px/1.4 var(--font-mono); color: var(--amber); }
.prof__line { font-size: 13px; line-height: 1.5; color: var(--text-soft); overflow-wrap: anywhere; }
.prof__cap { font-size: 11.5px; line-height: 1.4; color: var(--faint); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
/* На телефоне три колонки слишком узки: каждая строка — название, затем «сейчас» и «после» рядом. */
@media (max-width: 560px) {
  .prof__table thead { display: none; }
  .prof__table, .prof__table tbody { display: block; width: 100%; }
  .prof__table tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 10px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .prof__table tbody th { grid-column: 1 / -1; width: auto; padding: 0; border: 0; font-size: 12px; }
  .prof__table td { padding: 0; border: 0; text-align: left; font-size: 12px; }
  .prof__table td::before { content: attr(data-label); display: block; font: 500 10.5px/1.3 var(--font-ui); color: var(--faint); }
}
</style>
