<script setup lang="ts">
import { computed } from 'vue'
import { wealthNames } from '../../domain/birth'
import { genderOf } from '../../domain/engine'
import type { GameState } from '../../domain/types'
import PaperCard from '../common/PaperCard.vue'
import PixelPortrait from '../common/PixelPortrait.vue'
import WealthPips from '../common/WealthPips.vue'

const props = defineProps<{ game: GameState }>()
const b = computed(() => props.game.birth)
const sex = computed(() => (genderOf(props.game, 'hero') === 'f' ? 'Женский' : 'Мужской'))
const sibling = computed(() => props.game.people.find(p => p.id === 'sibling'))
const mrz = computed(() => {
  const [first = '', last = ''] = props.game.protagonist.name.toUpperCase().split(' ')
  return `PLG<190<${last}<<${first}<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`
})
const lead = computed(() => {
  const parts = [`В 190-м году полёта вы родились на «Пилигриме»: ${b.value.sectorName}, ${b.value.deck}. Это ${wealthNames[b.value.wealth]}.`]
  parts.push(sibling.value ? `У вас есть ${sibling.value.role.toLowerCase()}, ${sibling.value.age} лет.` : 'Вы единственный ребёнок в семье.')
  return parts.join(' ')
})
</script>

<template>
  <PaperCard label="Свидетельство о рождении" :code="b.certNo" :footer="mrz">
    <div class="cert">
      <PixelPortrait :name="game.protagonist.name" :age="0" :width="104" />
      <div class="cert__main">
        <span class="cert__label">Имя</span>
        <h2 class="cert__name wrap">{{ game.protagonist.name }}</h2>
        <p class="cert__lead">{{ lead }}</p>
      </div>
    </div>
    <dl class="cert__grid">
      <div><dt>Пол</dt><dd>{{ sex }}</dd></div>
      <div><dt>Сектор рождения</dt><dd>{{ b.sectorName }}, {{ b.deck }}</dd></div>
      <div><dt>Год полёта</dt><dd>190 · до цели 150 лет</dd></div>
      <div><dt>Достаток семьи</dt><dd class="cert__dots"><WealthPips :wealth="b.wealth" :size="11" /></dd></div>
      <div><dt>Родители</dt><dd>Мать, {{ b.parentAges[0] }} · Отец, {{ b.parentAges[1] }}</dd></div>
      <div><dt>Работа родителей</dt><dd>{{ b.parentJobs[0] }} · {{ b.parentJobs[1] }}</dd></div>
      <div><dt>Ожидаемая жизнь</dt><dd>{{ b.lifeExpectancy }} лет</dd></div>
      <div><dt>Здоровье при рождении</dt><dd>{{ b.healthNote }}</dd></div>
      <div><dt>Риск не дожить до 5 лет</dt><dd>{{ String(b.infantRisk).replace('.', ',') }} %</dd></div>
    </dl>
    <template #stamp><span class="cert__stamp">Зарегистрировано</span></template>
  </PaperCard>
</template>

<style scoped>
.cert { display: flex; gap: 16px; align-items: flex-start; min-width: 0; }
.cert__main { min-width: 0; display: grid; gap: 4px; }
.cert__label { font: 500 10px var(--font-mono); letter-spacing: 1.4px; text-transform: uppercase; color: #7a6a50; }
.cert__name { font: 600 40px/1.05 var(--font-display); }
.cert__lead { margin-top: 6px; font-size: 15px; line-height: 1.55; color: #3a2f22; }
.cert__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; margin: 16px 0 0; padding-top: 12px; border-top: 2px dashed var(--paper-line); }
.cert__grid dt { font: 500 9.5px/1.2 var(--font-mono); letter-spacing: 1px; text-transform: uppercase; color: #7a6a50; }
.cert__grid dd { margin: 2px 0 0; font-weight: 600; font-size: 13.5px; overflow-wrap: anywhere; }
.cert__dots { color: #8a5a12; }
.cert__stamp { position: absolute; right: 16px; bottom: 44px; border: 2px solid #b4473b; color: #b4473b; font: 700 11px/1 var(--font-mono); letter-spacing: 1.6px; padding: 5px 8px; text-transform: uppercase; transform: rotate(-8deg); opacity: .78; pointer-events: none; animation: stamp .35s cubic-bezier(.3, 1.6, .5, 1) .6s backwards; }
@keyframes stamp { from { transform: rotate(-8deg) scale(2.2); opacity: 0; } }
@media (max-width: 760px) {
  .cert__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cert__name { font-size: 30px; }
}
@media (max-width: 480px) {
  .cert { flex-direction: column; }
  .cert__grid { grid-template-columns: minmax(0, 1fr); }
  .cert__stamp { bottom: 40px; }
}
</style>
