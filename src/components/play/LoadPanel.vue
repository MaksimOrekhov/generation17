<script setup lang="ts">
import type { LoadView } from '../../domain/spendView'

defineProps<{ load: LoadView; note: { ok: boolean; text: string } | null }>()
defineEmits<{ change: [next: 1 | 0.6] }>()
</script>

<template>
  <section class="load" aria-labelledby="load-title">
    <h3 id="load-title" class="load__title">Режим работы</h3>
    <p class="load__cur" data-test="load-current">{{ load.title }}</p>
    <p class="load__text">{{ load.explanation }}</p>

    <table v-if="load.compare" class="load__table">
      <thead><tr><th scope="col"><span class="sr">Показатель</span></th><th scope="col">Полная</th><th scope="col">0,6 ставки</th></tr></thead>
      <tbody>
        <tr v-for="r in load.compare" :key="r.label">
          <th scope="row">{{ r.label }}</th><td>{{ r.full }}</td><td>{{ r.reduced }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="load.compare" class="load__cap">Оценка на следующий год без случайных событий.</p>

    <p v-if="load.reserve" class="load__reserve" data-test="load-reserve">{{ load.reserve }}</p>
    <p v-if="load.retirementNote" class="load__warn" role="note">⚠ {{ load.retirementNote }}</p>
    <p v-if="load.action.reason" class="load__reason" data-test="load-reason">{{ load.action.reason }}</p>
    <button type="button" class="btn btn--accent load__btn" :disabled="!load.action.available" data-test="load-action" @click="$emit('change', load.action.nextLoad)">{{ load.action.label }}</button>
    <p v-if="note" class="load__note" :class="{ 'load__note--bad': !note.ok }" role="status">{{ note.text }}</p>
  </section>
</template>

<style scoped>
.load { display: grid; gap: 8px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); min-width: 0; }
.load p { margin: 0; }
.load__title { font: 500 11px/1.3 var(--font-mono); letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }
.load__cur { font: 600 16px/1.3 var(--font-ui); color: var(--text); }
.load__text { font-size: 13.5px; line-height: 1.5; color: var(--text-soft); }
.load__table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12.5px; }
.load__table th, .load__table td { padding: 6px 4px; text-align: right; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; vertical-align: top; }
.load__table thead th { font: 500 11px var(--font-mono); color: var(--muted); }
.load__table tbody th { text-align: left; font-weight: 500; color: var(--muted); width: 32%; }
.load__table td { font-family: var(--font-mono); color: var(--text); font-variant-numeric: tabular-nums; }
.load__cap { font-size: 11.5px; color: var(--faint); }
.load__reserve { font-size: 13px; line-height: 1.5; color: var(--text-soft); overflow-wrap: anywhere; }
.load__warn { padding: 5px 8px; font-size: 12.5px; line-height: 1.45; color: var(--amber); border-left: 2px solid var(--amber-2); background: var(--panel); }
.load__reason { font-size: 13px; line-height: 1.45; color: var(--bad); overflow-wrap: anywhere; }
.load__btn { min-height: 44px; padding: 8px 16px; font-size: 14px; justify-self: start; max-width: 100%; }
.load__btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.load__note { font-size: 13px; color: var(--good); }
.load__note--bad { color: var(--bad); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 560px) {
  .load__btn { width: 100%; justify-self: stretch; }
  .load__table th, .load__table td { font-size: 11.5px; padding: 6px 2px; }
}
</style>
