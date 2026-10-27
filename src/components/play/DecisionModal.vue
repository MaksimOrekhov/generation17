<script setup lang="ts">
import { computed } from 'vue'
import { checkChance, resolveText } from '../../domain/engine'
import { useGameStore } from '../../stores/game'
import { logKindLabels, skillLabels, years } from '../../ui/format'
import ModalShell from '../common/ModalShell.vue'

const store = useGameStore()
const g = computed(() => store.game)
const event = computed(() => store.currentEvent)

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
        <button v-for="(choice, i) in event.choices" :key="i" class="choice" @click="store.choose(i)">
          <kbd>{{ i + 1 }}</kbd>
          <span class="choice__main">
            <strong>{{ resolveText(g, choice.text) }}</strong>
            <small>{{ resolveText(g, choice.hint) }}</small>
          </span>
          <span v-if="odds(i)" class="choice__odds">{{ odds(i) }}</span>
        </button>
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
.choice:hover { border-color: var(--amber); background: #2a2030; }
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
.dec__key { font: 500 10px var(--font-mono); opacity: .7; margin-left: 6px; }
@media (max-width: 560px) {
  .choice { grid-template-columns: 28px minmax(0, 1fr); }
  .choice__odds { grid-column: 2; justify-self: start; }
  .dec__title { font-size: 23px; }
}
</style>
