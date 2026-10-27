<script setup lang="ts">
import { computed } from 'vue'
import { FOCUS_FROM_AGE, FOCUS_UNLOCK, canFocus } from '../../domain/focus'
import type { Focus } from '../../domain/types'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'

const store = useGameStore()
const age = computed(() => store.game.age)
const options: { id: Focus; name: string; kid: string; effect: string }[] = [
  { id: 'study', name: 'Учёба', kid: 'Школа', effect: 'знания ↑' },
  { id: 'relationships', name: 'Близкие', kid: 'Друзья', effect: 'связи ↑' },
  { id: 'work', name: 'Работа', kid: 'Работа', effect: 'репутация ↑' },
  { id: 'rest', name: 'Отдых', kid: 'Игры', effect: 'стресс ↓' },
  { id: 'civic', name: 'Общество', kid: 'Общество', effect: 'влияние ↑' }
]
</script>

<template>
  <Panel v-if="age < FOCUS_FROM_AGE" title="Первые годы" aside="за тебя решают взрослые">
    <p class="focus__note">
      Пока ты слишком мал, чтобы выбирать, чем заниматься: растёшь, привыкаешь к голосам и звукам корабля.
      Фокус года появится в {{ FOCUS_FROM_AGE }} лет.
    </p>
  </Panel>
  <Panel v-else title="Фокус года" aside="меняется в любой момент">
    <div class="focus" role="group" aria-label="Фокус года">
      <button
        v-for="o in options" :key="o.id" class="focus__item" :aria-pressed="store.game.focus === o.id"
        :disabled="store.game.stopped || !canFocus(age, o.id)" @click="store.changeFocus(o.id)"
      >
        <strong>{{ age < 14 ? o.kid : o.name }}</strong>
        <span>{{ canFocus(age, o.id) ? o.effect : `с ${FOCUS_UNLOCK[o.id]} лет` }}</span>
      </button>
    </div>
  </Panel>
</template>

<style scoped>
.focus__note { padding: 14px 12px; font-size: 13.5px; line-height: 1.55; color: var(--muted); }
.focus { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; padding: 12px; }
.focus__item { display: grid; gap: 2px; padding: 8px 4px; text-align: center; background: var(--bg-2); border: 2px solid var(--line); box-shadow: var(--shadow-key); min-width: 0; }
.focus__item strong { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
.focus__item span { font: 500 10px var(--font-mono); color: var(--faint); }
.focus__item:hover:not(:disabled) { border-color: var(--line-2); }
.focus__item[aria-pressed='true'] { border-color: var(--amber); background: var(--amber-dim); }
.focus__item[aria-pressed='true'] span { color: #e8b66d; }
.focus__item:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
@media (max-width: 560px) { .focus { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

.focus__item { min-height: 58px; }
.focus__item strong { font-size: 14px; }
.focus__item[aria-pressed='true'] { border-color: var(--amber); background: var(--amber-dim); }

</style>
