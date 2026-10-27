<script setup lang="ts">
import { computed } from 'vue'
import { resolveText } from '../../domain/engine'
import { SEASON_NAMES } from '../../domain/clock'
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
    season: g.value.season,
    progress: store.progress,
    companion,
    spot: store.currentMoment?.spot ?? null
  }
})

const moment = computed(() => store.currentMoment)
const latest = computed(() => g.value.history[0])
// Карточка не должна закрывать подсвеченный предмет: низкие объекты — карточка сверху, верхние — снизу.
const momentPlacement = computed(() => (moment.value && ['window', 'terminal'].includes(moment.value.spot) ? 'bottom' : 'top'))
const place = computed(() => `Каюта ${g.value.birth.deck}`)
</script>

<template>
  <section class="scene" :class="{ 'scene--stopped': g.stopped }" aria-label="Сцена">
    <div class="scene__stage">
    <SceneCanvas :model="model" />
    <div class="scene__hud">
      <span class="scene__tag">{{ place }} · <b>{{ SEASON_NAMES[g.season].toLowerCase() }}</b></span>
      <span class="scene__tag scene__attn" title="Внимание: сколько моментов можно принять в этом году">
        внимание
        <i v-for="n in 3" :key="n" :class="{ used: n > g.attention }" />
      </span>
    </div>
    <Transition name="moment">
      <MomentPopup
        v-if="moment && !store.blocked"
        :key="moment.id + g.age + g.season"
        :title="moment.title"
        :text="resolveText(g, moment.text)"
        :where="spotLabels[moment.spot]"
        :accept-label="moment.accept.label"
        :skip-label="moment.skip.label"
        :attention="g.attention"
        :left="store.momentLeft"
        :placement="momentPlacement"
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
.scene { position: relative; border: 2px solid var(--line-2); background: var(--panel); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--line); }
.scene__stage { position: relative; }
.scene__hud { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; justify-content: space-between; gap: 8px; pointer-events: none; }
.scene__tag { background: rgba(14, 12, 23, .85); border: 1px solid var(--line-2); padding: 3px 8px; font: 500 11px var(--font-mono); letter-spacing: .4px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
.scene__tag b { color: var(--amber); font-weight: 500; }
.scene__attn i { width: 11px; height: 11px; background: var(--amber); border: 2px solid #ffd08a; transition: background .2s, border-color .2s; }
.scene__attn i.used { background: transparent; border-color: var(--line-2); }
.scene__caption { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; padding: 10px 12px; border-top: 2px solid var(--line); background: var(--panel); font-size: 13.5px; color: var(--muted); align-items: baseline; }
.scene__caption b { color: var(--text); font-weight: 500; }
.scene__when { font: 600 12px var(--font-mono); color: var(--amber); }
.scene--stopped :deep(canvas) { filter: grayscale(.8) brightness(.7); }
.moment-enter-active, .moment-leave-active { transition: opacity .2s, transform .2s; }
.moment-leave-to { opacity: 0; transform: translateY(12px); }

.scene { border: 1px solid #5e6978; box-shadow: 0 18px 48px #0005; background: #111722; }
.scene__hud { top: 12px; left: 12px; right: 12px; }
.scene__tag { padding: 6px 9px; background: rgba(12, 16, 24, .88); border-color: #5b6878; font-size: 11px; }
.scene__caption { grid-template-columns: 48px minmax(0, 1fr); gap: 16px; padding: 20px 22px 22px; border-top: 1px solid #536174; background: #1c2632; color: var(--text-soft); font: 400 17px/1.6 var(--font-display); }
.scene__caption b { color: var(--text); }
.scene__when { align-self: start; padding-top: 4px; font-size: 12px; color: var(--amber); }
@media (max-width: 560px) { .scene__caption { grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 15px; font-size: 16px; } }

</style>
