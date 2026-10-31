<script setup lang="ts">
import { variantText } from '../../content/load'
import { computed, onBeforeUnmount, watch } from 'vue'
import { residenceOf } from '../../domain/birth'
import { resolveText } from '../../domain/engine'
import { currentPartner } from '../../domain/people'
import { PERSONAL_TIME, basisText, personalTimeOf } from '../../domain/personalTime'
import type { SceneModel } from '../../render/scene'
import { useGameStore } from '../../stores/game'
import { spotLabels } from '../../ui/format'
import MomentPopup from './MomentPopup.vue'
import SceneCanvas from './SceneCanvas.vue'

const store = useGameStore()
const g = computed(() => store.game)

const model = computed<SceneModel>(() => {
  const parent = g.value.people.find(p => p.id === 'parent')
  const partner = g.value.flags.livingTogether === true ? currentPartner(g.value) ?? (!g.value.relationships ? g.value.people.find(p => p.id === 'friend') : undefined) : undefined
  const companion = g.value.age <= 18 && parent?.alive
    ? { name: parent.name, age: parent.age, kind: 'parent' as const }
    : g.value.age >= 20 && partner?.alive
      ? { name: partner.name, age: partner.age, kind: 'partner' as const }
      : null
  return {
    name: g.value.protagonist.name,
    age: g.value.age,
    wealth: g.value.birth.wealth,
    sectorId: residenceOf(g.value),
    progress: store.progress,
    companion,
    spot: store.currentMoment?.spot ?? null
  }
})

const moment = computed(() => store.currentMoment)
const visibleSkipFeedback = computed(() => store.started && store.skipFeedback && !moment.value && !store.blocked ? store.skipFeedback : null)
const latest = computed(() => g.value.history[0])
const place = computed(() => `Каюта ${g.value.birth.deck}`)
const time = computed(() => personalTimeOf(g.value))
const timeTitle = computed(() => `Личное время: ${time.value.left} из ${time.value.limit}. ${basisText(time.value)}. Это дела сверх обычных обязанностей; новый год приносит новое время, остаток не копится.`)

let feedbackTimer: ReturnType<typeof setTimeout> | null = null
watch(() => store.skipFeedback?.token ?? null, token => {
  if (feedbackTimer !== null) clearTimeout(feedbackTimer)
  feedbackTimer = null
  if (token === null) return
  feedbackTimer = setTimeout(() => {
    store.clearSkipFeedback(token)
    feedbackTimer = null
  }, 3000)
}, { flush: 'sync', immediate: true })

onBeforeUnmount(() => {
  if (feedbackTimer !== null) clearTimeout(feedbackTimer)
  store.clearSkipFeedback()
})
</script>

<template>
  <section class="scene pixel-corners" :class="{ 'scene--stopped': g.stopped }" aria-label="Сцена">
    <div class="scene__stage">
    <SceneCanvas :model="model" />
    <div class="scene__hud">
      <span class="scene__tag">{{ place }}</span>
      <span class="scene__tag scene__attn" :title="timeTitle" :aria-label="timeTitle" data-test="time-hud">
        личное время
        <i v-for="n in time.limit" :key="n" :class="{ used: n > time.left }" />
      </span>
    </div>
    <Transition name="moment">
      <MomentPopup
        v-if="moment && !store.blocked"
        :key="moment.id + g.age + g.phase"
        :title="moment.title"
        :text="resolveText(g, variantText(g, moment.text, moment.textVariants))"
        :where="spotLabels[moment.spot]"
        :accept-label="resolveText(g, moment.accept.label)"
        :skip-label="resolveText(g, moment.skip.label)"
        :time-left="time.left"
        :cost="PERSONAL_TIME.moment"
        :left="store.momentLeft"
        @accept="store.acceptMoment()"
        @skip="store.dismissMoment(moment.id)"
      />
    </Transition>
    <div v-if="visibleSkipFeedback" :key="visibleSkipFeedback.token" class="scene__skip-feedback" role="status" aria-live="polite" aria-atomic="true">
      <b>Решил иначе</b>
      <span>{{ visibleSkipFeedback.text }}</span>
    </div>
    </div>
    <div v-if="latest" class="scene__caption">
      <span class="scene__when">{{ g.age }} л</span>
      <p class="wrap"><b>{{ latest.title }}.</b> {{ latest.text }}</p>
    </div>
  </section>
</template>

<style scoped>
.scene { position: relative; border: 1px solid var(--line-2); background: var(--panel); }
.scene__stage { position: relative; }
.scene__hud { position: absolute; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; gap: 8px; pointer-events: none; }
.scene__tag { background: rgba(14, 12, 23, .78); border: 1px solid #665a7d; padding: 5px 8px; font: 500 11px var(--font-mono); letter-spacing: .4px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
.scene__tag b { color: var(--amber); font-weight: 500; }
.scene__attn i { width: 11px; height: 11px; background: var(--amber); border: 2px solid #ffd08a; transition: background .2s, border-color .2s; }
.scene__attn i.used { background: transparent; border-color: var(--line-2); }
.scene__caption { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 12px 14px; border-top: 1px solid var(--line); background: var(--panel); font: 400 14px/1.5 var(--font-ui); color: var(--text-soft); align-items: baseline; }
.scene__caption b { color: var(--text); font-weight: 500; }
.scene__when { align-self: start; padding-top: 4px; font: 600 12px var(--font-mono); color: var(--amber); }
.scene__skip-feedback {
  position: absolute; z-index: 2; left: 12px; right: 12px; bottom: 12px;
  display: grid; gap: 4px; max-width: 760px; margin-inline: auto; padding: 12px 16px;
  border: 1px solid var(--amber); background: rgba(24, 21, 39, .96); color: var(--text-soft);
  box-shadow: 0 0 22px #ffb34733; font: 400 14px/1.45 var(--font-ui); overflow-wrap: break-word;
}
.scene__skip-feedback b { color: var(--amber); font: 600 11px var(--font-mono); letter-spacing: .6px; }
.scene--stopped :deep(canvas) { filter: grayscale(.8) brightness(.7); }
.moment-enter-active, .moment-leave-active { transition: opacity .2s, transform .2s; }
.moment-leave-to { opacity: 0; transform: translateY(12px); }
@media (max-width: 640px) {
  .scene__skip-feedback { left: 8px; right: 8px; bottom: 8px; padding: 10px 12px; font-size: 13px; }
}
</style>
