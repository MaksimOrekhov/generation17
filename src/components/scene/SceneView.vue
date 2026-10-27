<script setup lang="ts">
import { computed } from 'vue'
import { resolveText } from '../../domain/engine'
import type { SceneModel } from '../../render/scene'
import { useGameStore } from '../../stores/game'
import { spotLabels } from '../../ui/format'
import MomentPopup from './MomentPopup.vue'
import SceneCanvas from './SceneCanvas.vue'

const store = useGameStore()
const g = computed(() => store.game)

const model = computed<SceneModel>(() => {
  const parent = g.value.people.find(p => p.id === 'parent')
  const partner = g.value.flags.livingTogether === true ? g.value.people.find(p => p.id === 'friend') : undefined
  const companion = g.value.age <= 18 && parent?.alive
    ? { name: parent.name, age: parent.age, kind: 'parent' as const }
    : g.value.age >= 20 && partner?.alive
      ? { name: partner.name, age: partner.age, kind: 'partner' as const }
      : null
  return {
    name: g.value.protagonist.name,
    age: g.value.age,
    wealth: g.value.birth.wealth,
    sectorId: g.value.birth.sectorId,
    progress: store.progress,
    companion,
    spot: store.currentMoment?.spot ?? null
  }
})

const moment = computed(() => store.currentMoment)
const latest = computed(() => g.value.history[0])
const place = computed(() => `Каюта ${g.value.birth.deck}`)
</script>

<template>
  <section class="scene pixel-corners" :class="{ 'scene--stopped': g.stopped }" aria-label="Сцена">
    <div class="scene__stage">
    <SceneCanvas :model="model" />
    <div class="scene__hud">
      <span class="scene__tag">{{ place }}</span>
      <span class="scene__tag scene__attn" title="Внимание: сколько моментов можно принять в этом году">
        внимание
        <i v-for="n in 3" :key="n" :class="{ used: n > g.attention }" />
      </span>
    </div>
    <Transition name="moment">
      <MomentPopup
        v-if="moment && !store.blocked"
        :key="moment.id + g.age + g.phase"
        :title="moment.title"
        :text="resolveText(g, moment.text)"
        :where="spotLabels[moment.spot]"
        :accept-label="moment.accept.label"
        :skip-label="moment.skip.label"
        :attention="g.attention"
        :left="store.momentLeft"
        @accept="store.acceptMoment()"
        @skip="store.dismissMoment()"
      />
    </Transition>
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
.scene--stopped :deep(canvas) { filter: grayscale(.8) brightness(.7); }
.moment-enter-active, .moment-leave-active { transition: opacity .2s, transform .2s; }
.moment-leave-to { opacity: 0; transform: translateY(12px); }
</style>
