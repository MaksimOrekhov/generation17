<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()

/** Подсказки для первой жизни: показываются один раз, пока игрок не нажмёт «Понятно». */
const hint = computed(() => {
  if (!store.started || store.game.stopped || store.blocked) return null
  const seen = store.hintsSeen
  if (store.currentMoment && !seen.moment) {
    return { id: 'moment', title: 'Это момент', text: 'Небольшая возможность внутри года. На высокой скорости время идёт чуть медленнее, пока карточка открыта; если не ответить, она просто исчезнет. Принять — значит потратить единицу личного времени этого года (счётчик в углу сцены): Enter — принять, Esc — пропустить.' }
  }
  if (!seen.time && store.game.age < 2) {
    return { id: 'time', title: 'Время идёт само', text: `Год — около ${store.secondsPerYear} с на скорости 1×. Скорость меняется кнопками сверху, Пробел ставит на паузу. Когда нужно решение, время остановится само.` }
  }
  if (!seen.forks && store.game.forks.length) {
    return { id: 'forks', title: 'Развилка', text: 'Самые важные решения копятся в панели «Развилки»: годы спустя к ним добавятся последствия. Что было бы на других путях, вы не узнаете.' }
  }
  return null
})
</script>

<template>
  <aside v-if="hint" :key="hint.id" class="hint" role="note">
    <div class="hint__head"><span>Подсказка</span><button class="hint__skip" @click="store.seeHint('time'); store.seeHint('moment'); store.seeHint('forks')">пропустить все</button></div>
    <h4>{{ hint.title }}</h4>
    <p>{{ hint.text }}</p>
    <button class="btn btn--sm btn--primary" @click="store.seeHint(hint.id)">Понятно</button>
  </aside>
</template>

<style scoped>
.hint { position: fixed; left: 16px; bottom: 16px; z-index: 45; width: min(340px, calc(100vw - 32px)); display: grid; gap: 6px; padding: 12px 14px; background: var(--panel); border: 2px solid var(--cool); box-shadow: 0 0 0 2px var(--bg), 0 12px 30px #000a; animation: up .35s steps(6); }
.hint__head { display: flex; justify-content: space-between; align-items: center; font: 500 10px var(--font-mono); letter-spacing: 1.2px; text-transform: uppercase; color: var(--cool); }
.hint__skip { background: none; border: 0; padding: 0; color: var(--faint); font: 400 10px var(--font-mono); text-decoration: underline; }
.hint h4 { font: 600 17px/1.2 var(--font-display); }
.hint p { font-size: 13px; color: var(--text-soft); line-height: 1.5; }
.hint .btn { justify-self: start; }
@keyframes up { from { transform: translateY(14px); opacity: 0; } }
</style>
