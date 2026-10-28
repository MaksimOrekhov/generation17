<script setup lang="ts">
import type { CareerView, RetirementView } from '../../domain/spendView'

defineProps<{ career: CareerView; retirement: RetirementView | null }>()
defineEmits<{ retrain: [] }>()
</script>

<template>
  <section class="car" aria-labelledby="career-title" data-test="career">
    <h3 id="career-title" class="car__title">Профессиональный рост</h3>
    <p class="car__main">{{ career.profession }}<template v-if="career.gradeTitle"> · {{ career.gradeTitle }}</template></p>
    <dl class="car__facts">
      <div v-for="f in career.facts" :key="f.label"><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></div>
    </dl>

    <div v-if="career.next" class="car__next" data-test="grade-next">
      <p class="car__sub">{{ career.next.title }}</p>
      <ul class="car__reqs">
        <li v-for="r in career.next.items" :key="r.label" class="car__req" :class="r.met ? 'car__req--met' : 'car__req--todo'">
          <span class="car__mark" aria-hidden="true">{{ r.met ? '✓' : '·' }}</span>
          <span class="car__rl">{{ r.label }}</span>
          <b class="car__rv">{{ r.value }}</b>
          <span class="sr">{{ r.met ? 'выполнено' : 'ещё не выполнено' }}</span>
        </li>
      </ul>
    </div>
    <p v-if="career.status" class="car__status" :class="`car__status--${career.status.tone}`" data-test="grade-status">{{ career.status.text }}</p>

    <p class="car__post" :class="`car__post--${career.post.state}`" data-test="post">{{ career.post.text }}</p>
    <p class="car__fine">Разряд — квалификация, назначение — должность: одно не зависит от другого, и отказ от должности не закрывает рост разряда.</p>

    <div v-if="career.transition" class="car__trans" data-test="transition">
      <p class="car__sub">{{ career.transition.title }}</p>
      <p v-for="line in career.transition.lines" :key="line" class="car__line">{{ line }}</p>
    </div>

    <div class="car__retrain">
      <p class="car__sub">Смена профессии</p>
      <p class="car__line" data-test="retrain-status">{{ career.retrainText }}</p>
      <button v-if="career.retrainAvailable" type="button" class="btn btn--sm car__btn" data-test="go-retrain" @click="$emit('retrain')">Выбрать новую специальность →</button>
    </div>
  </section>

  <section v-if="retirement" class="car" aria-labelledby="pension-title" data-test="retirement">
    <h3 id="pension-title" class="car__title">Пенсия</h3>
    <p class="car__main">{{ retirement.title }}</p>
    <dl class="car__facts">
      <div v-for="r in retirement.rows" :key="r.label"><dt>{{ r.label }}</dt><dd>{{ r.value }}</dd></div>
    </dl>
    <p v-for="n in retirement.notes" :key="n" class="car__line">{{ n }}</p>
  </section>
</template>

<style scoped>
.car { display: grid; gap: 7px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); min-width: 0; }
.car p { margin: 0; }
.car__title { font: 500 11px/1.3 var(--font-mono); letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }
.car__main { font: 600 16px/1.3 var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.car__sub { font: 600 13px/1.4 var(--font-ui); color: var(--text); }
.car__facts { display: grid; gap: 1px; margin: 0; background: var(--line); border: 1px solid var(--line); }
.car__facts div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 10px; background: var(--panel); }
.car__facts dt { color: var(--muted); font-size: 13px; min-width: 0; }
.car__facts dd { margin: 0; text-align: right; font: 500 13px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }
.car__next { display: grid; gap: 4px; }
.car__reqs { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.car__req { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: baseline; gap: 6px; padding: 5px 8px; font-size: 13px; border-left: 2px solid var(--line-2); background: var(--panel); }
.car__req--met { border-left-color: var(--good); color: var(--text-soft); }
.car__req--met .car__mark, .car__req--met .car__rv { color: var(--good); }
.car__req--todo { color: var(--text); }
.car__req--todo .car__rv { color: var(--amber); }
.car__mark { font: 600 12px var(--font-mono); color: var(--muted); }
.car__rl { min-width: 0; overflow-wrap: anywhere; }
.car__rv { font: 600 13px var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.car__status { font-size: 13px; line-height: 1.45; color: var(--text-soft); overflow-wrap: anywhere; }
.car__status--ready { color: var(--good); }
.car__status--max { color: var(--amber); }
.car__post { font-size: 13px; line-height: 1.45; color: var(--text-soft); }
.car__post--held { color: var(--good); }
.car__fine { font-size: 11.5px; line-height: 1.4; color: var(--faint); }
.car__trans { display: grid; gap: 4px; padding: 8px 10px; border-left: 2px solid var(--cool); background: var(--panel); }
.car__line { font-size: 13px; line-height: 1.5; color: var(--text-soft); overflow-wrap: anywhere; }
.car__retrain { display: grid; gap: 5px; padding-top: 6px; border-top: 1px solid var(--line); }
.car__btn { justify-self: start; min-height: 40px; max-width: 100%; }
.car__btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 560px) {
  .car__btn { width: 100%; justify-self: stretch; }
}
</style>
