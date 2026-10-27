<script setup lang="ts">
import { ref } from 'vue'
import { LIFE_PRESETS } from '../../domain/clock'
import type { Atmosphere } from '../../domain/types'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'
import PeerRow from '../common/PeerRow.vue'
import BirthCertificate from './BirthCertificate.vue'
import BirthReel from './BirthReel.vue'
import BirthStats from './BirthStats.vue'

const store = useGameStore()
// У жизни, продолженной из сохранения, барабан уже не нужен.
const revealed = ref(false)
const atmospheres: { id: Atmosphere; name: string; text: string }[] = [
  { id: 'calm', name: 'Спокойная', text: 'Реалистичная жизнь на корабле: семья, работа, общество.' },
  { id: 'mystery', name: 'С тайнами', text: 'Закрытые сектора, странные записи, необъяснимое. Рекомендуем.' },
  { id: 'uncanny', name: 'Тревожная', text: 'Тайны плюс жутковатые сцены. Без насилия, но можно испугаться.' }
]
</script>

<template>
  <main class="birth">
    <header class="birth__head">
      <span class="birth__brand">Поколение <b>17</b></span>
      <h1 class="label-caps">Регистрация рождения · «Пилигрим»</h1>
    </header>

    <BirthReel v-if="!revealed" :target="store.game.birth.sectorId" @done="revealed = true" />

    <div v-else class="birth__reveal">
      <BirthCertificate :game="store.game" class="birth__item" style="--d: 0s" />
      <BirthStats :birth="store.game.birth" class="birth__item" style="--d: .25s" />
      <Panel title="Родились в тот же год" aside="ровесники" class="birth__item" style="--d: .45s">
        <ul>
          <PeerRow v-for="p in store.game.peers" :key="p.id" :peer="p" :age="0" />
        </ul>
        <p class="birth__note">Их жизни тоже пройдут до конца. Мы покажем их рядом с вашей.</p>
      </Panel>

      <section class="birth__start birth__item" style="--d: .65s">
        <div class="birth__atmo" role="group" aria-label="Атмосфера">
          <span class="label-caps">Атмосфера жизни</span>
          <div class="birth__presets">
            <button v-for="a in atmospheres" :key="a.id" class="birth__preset" :aria-pressed="store.game.atmosphere === a.id" @click="store.setAtmosphere(a.id)">
              <b>{{ a.name }}</b>
              <span>{{ a.text }}</span>
            </button>
          </div>
        </div>
        <span class="label-caps">Длина жизни</span>
        <div class="birth__presets" role="group" aria-label="Длина жизни">
          <button v-for="p in LIFE_PRESETS" :key="p.minutes" class="birth__preset" :aria-pressed="store.preset === p.minutes" @click="store.setPreset(p.minutes)">
            <b>{{ p.minutes }} мин</b>
            <span>1 год ≈ {{ p.secondsPerYear }} с · {{ p.label.toLowerCase() }}</span>
          </button>
        </div>
        <button class="btn btn--primary birth__go" @click="store.begin()">Начать жизнь ▶</button>
        <p class="birth__seed">жребий #{{ store.game.seed }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.birth { max-width: 920px; margin: 0 auto; padding: 36px 16px 64px; display: grid; gap: 20px; }
.birth__head { display: grid; justify-items: center; gap: 10px; padding-bottom: 12px; }
.birth__brand { font: 600 28px/1 var(--font-display); }
.birth__brand b { color: var(--amber); font-weight: 600; }
.birth__head h1 { color: var(--amber); letter-spacing: 3px; font-size: 12px; text-align: center; }
.birth__reveal { display: grid; gap: 20px; min-width: 0; }
.birth__item { animation: show .5s ease-out var(--d, 0s) backwards; }
.birth__note { padding: 8px 12px 10px; font-size: 13px; color: var(--faint); }
.birth__start { display: grid; gap: 12px; }
.birth__presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.birth__preset { display: grid; gap: 2px; text-align: left; padding: 14px; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow-key); }
.birth__preset b { font: 600 20px/1.1 var(--font-display); }
.birth__preset span { font-size: 13px; color: var(--muted); }
.birth__preset:hover { border-color: var(--line-2); }
.birth__preset[aria-pressed='true'] { border-color: var(--amber); background: var(--amber-dim); }
.birth__atmo { display: grid; gap: 8px; }
.birth__go { font: 600 18px/1 var(--font-display); padding: 17px; }
.birth__seed { text-align: center; font: 400 11px var(--font-mono); color: var(--faint); letter-spacing: 1px; }
@keyframes show { from { opacity: 0; transform: translateY(14px); } }
@media (max-width: 560px) { .birth__presets { grid-template-columns: minmax(0, 1fr); } }
</style>
