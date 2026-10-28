<script setup lang="ts">
import { computed } from 'vue'
import { canChoose, checkChance, resolveText } from '../../domain/engine'
import { formatCredits } from '../../domain/economyView'
import { useGameStore } from '../../stores/game'
import { logKindLabels, skillLabels, years } from '../../ui/format'
import ModalShell from '../common/ModalShell.vue'
import ParticipantPicker from './ParticipantPicker.vue'

const store = useGameStore()
const g = computed(() => store.game)
const event = computed(() => store.currentEvent)
const availability = computed(() => event.value?.choices.map((_, i) => canChoose(g.value, i, store.storyTarget(i))) ?? [])
const tripIndex = computed(() => event.value?.choices.findIndex(c => c.purchase?.offer === 'family-trip') ?? -1)
const tripOptions = computed(() => tripIndex.value < 0 ? [] : availability.value[tripIndex.value]?.purchase?.familyParticipants ?? [])
const moneyText = (index: number) => {
  const choice = event.value?.choices[index]
  if (!choice) return null
  const signed = (money: number) => `${money < 0 ? '−' : money > 0 ? '+' : ''}${formatCredits(Math.abs(money))}.`
  const parts: string[] = []
  const bought = availability.value[index]?.purchase
  if (bought) {
    parts.push(signed(-bought.oneTimeCost))
    if (bought.regularCost !== undefined && bought.oneTimeCost < bought.regularCost) parts.push(`вместо ${formatCredits(bought.regularCost)}.`)
    if (bought.attention) parts.push(`внимание −${bought.attention}`)
  }
  if (choice.effects.money !== undefined) parts.push(signed(choice.effects.money))
  if (choice.check?.success.money) parts.push(`При успехе: ${signed(choice.check.success.money)}`)
  if (choice.check?.failure.money) parts.push(`При неудаче: ${signed(choice.check.failure.money)}`)
  return parts.join(' · ') || null
}

const odds = (index: number) => {
  const check = event.value?.choices[index]?.check
  if (!check) return null
  const skill = skillLabels.find(s => s.key === check.skill)!.name
  return `шанс ≈ ${Math.round(checkChance(g.value, check) * 100)}% · ${skill.toLowerCase()} ${Math.round(g.value.skills[check.skill])}`
}
</script>

<template>
  <!-- решение -->
  <ModalShell v-if="event && !store.result" :label="event.title" tone="amber">
    <div class="dec__top"><span>Решение · {{ event.category }}</span><span>{{ years(g.age) }} · время остановлено</span></div>
    <div class="dec__body">
      <h2 class="dec__title">{{ event.title }}</h2>
      <p class="dec__text">{{ resolveText(g, event.body) }}</p>
      <p v-if="!store.hintsSeen.decision" class="dec__hint">Решения останавливают время. Выберите вариант кнопкой или клавишей 1–{{ event.choices.length }}. Последствия могут проявиться через годы.</p>
      <div class="dec__choices">
        <template v-for="(choice, i) in event.choices" :key="i">
          <button class="choice" :disabled="!availability[i]?.available" @click="store.choose(i)">
            <kbd>{{ i + 1 }}</kbd>
            <span class="choice__main">
              <strong>{{ resolveText(g, choice.text) }}</strong>
              <small>{{ resolveText(g, choice.hint) }}</small>
              <small v-if="moneyText(i)" class="choice__money">{{ moneyText(i) }}</small>
              <small v-if="availability[i]?.reason" class="choice__reason">{{ availability[i]?.reason }}</small>
            </span>
            <span v-if="odds(i)" class="choice__odds">{{ odds(i) }}</span>
          </button>
          <div v-if="i === tripIndex && tripOptions.length" class="dec__trip">
            <small>Кого позвать: двое или трое близких.</small>
            <ParticipantPicker :options="tripOptions" :selected="store.storyParticipants" :max="3" @toggle="store.toggleStoryParticipant" />
          </div>
        </template>
      </div>
    </div>
  </ModalShell>

  <!-- что произошло -->
  <ModalShell v-else-if="store.result" label="Что произошло" tone="neutral">
    <div class="dec__top dec__top--quiet"><span>Что произошло</span><span>{{ years(g.age) }}</span></div>
    <div class="dec__body">
      <article v-for="entry in store.result" :key="entry.id" class="res" :class="`res--${entry.kind}`">
        <span class="res__kind">{{ logKindLabels[entry.kind] }}</span>
        <h3>{{ entry.title }}</h3>
        <p>{{ entry.text }}</p>
      </article>
      <div class="dec__actions">
        <button class="btn btn--primary" @click="store.continueAfterResult()">Продолжить <kbd class="dec__key">Enter</kbd></button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.dec__top { display: flex; justify-content: space-between; gap: 12px; padding: 9px 16px; background: var(--amber); color: var(--amber-ink); font: 600 11px/1.2 var(--font-mono); letter-spacing: 1.2px; text-transform: uppercase; }
.dec__top--quiet { background: var(--panel-2); color: var(--muted); }
.dec__body { padding: 18px 20px 20px; display: grid; gap: 14px; }
.dec__title { font: 600 28px/1.15 var(--font-display); }
.dec__text { font-size: 15.5px; line-height: 1.6; color: var(--text-soft); max-width: 62ch; }
.dec__hint { font-size: 12.5px; color: var(--cool); padding: 6px 10px; border: 1px dashed #2c4658; }
.dec__choices { display: grid; gap: 8px; }
.choice { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 12px; align-items: center; text-align: left; padding: 11px 14px; background: var(--bg-2); border: 2px solid var(--line-2); box-shadow: var(--shadow-key); transition: border-color .12s, background .12s; }
.choice:hover:not(:disabled) { border-color: var(--amber); background: #2a2030; }
.choice:disabled { cursor: not-allowed; }
.choice:disabled strong, .choice:disabled kbd { opacity: .65; }
.choice__main .choice__money { color: var(--amber); font-family: var(--font-mono); }
.choice__main .choice__reason { color: var(--rose); }
.choice kbd { display: grid; place-items: center; width: 28px; height: 28px; font: 600 13px var(--font-mono); background: var(--amber-dim); color: var(--amber); border: 1px solid var(--amber-2); }
.choice__main { display: grid; gap: 1px; min-width: 0; }
.choice__main strong { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.choice__main small { font-size: 12.5px; color: var(--muted); }
.choice__odds { font: 500 11px var(--font-mono); color: var(--cool); border: 1px solid #2c4658; padding: 2px 7px; white-space: nowrap; }
.res { display: grid; gap: 3px; padding: 12px 14px; background: var(--bg-2); border-left: 3px solid var(--line-2); }
.res--choice { border-left-color: var(--amber); }
.res--memory { border-left-color: var(--rose); }
.res__kind { font: 500 10px var(--font-mono); letter-spacing: 1.2px; text-transform: uppercase; color: var(--faint); }
.res h3 { font: 600 18px/1.25 var(--font-display); }
.res p { color: var(--text-soft); font-size: 14.5px; line-height: 1.55; }
.dec__actions { display: flex; justify-content: flex-end; }
.dec__trip { display: grid; gap: 6px; padding: 8px 10px; border: 1px dashed var(--line-2); }
.dec__trip small { font-size: 12.5px; color: var(--muted); }
.dec__key { font: 500 10px var(--font-mono); opacity: .7; margin-left: 6px; }
@media (max-width: 560px) {
  .choice { grid-template-columns: 28px minmax(0, 1fr); }
  .choice__odds { grid-column: 2; justify-self: start; }
  .dec__title { font-size: 23px; }
}
</style>
