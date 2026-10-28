<script setup lang="ts">
import { computed } from 'vue'
import { residenceOf, sectorById } from '../../domain/birth'
import { useGameStore } from '../../stores/game'
import { lifeStage, occupation, years } from '../../ui/format'
import PaperCard from '../common/PaperCard.vue'
import PixelPortrait from '../common/PixelPortrait.vue'
import WealthPips from '../common/WealthPips.vue'

const store = useGameStore()
const g = computed(() => store.game)
const mrz = computed(() => {
  const [first = '', last = ''] = g.value.protagonist.name.toUpperCase().split(' ')
  return `PLG<${g.value.shipYear - g.value.age}<${last}<<${first}<<<<<<<<<<<<<<<<<<<<<<<<`
})
const home = computed(() => sectorById(residenceOf(g.value)))
const lives = computed(() => (g.value.age < 16 ? 'с семьёй' : g.value.flags.movedOut ? 'отдельно' : g.value.flags.livingTogether ? 'вдвоём' : g.value.residence && g.value.residence !== g.value.birth.sectorId ? 'в новом секторе' : 'в родном секторе'))
</script>

<template>
  <PaperCard label="Личное дело" :code="g.birth.certNo" :footer="mrz">
    <div class="file">
      <PixelPortrait :name="g.protagonist.name" :age="g.age" :width="64" />
      <div class="file__id">
        <h2 class="file__name wrap">{{ g.protagonist.name }}</h2>
        <p class="file__sub">{{ years(g.age) }} · {{ occupation(g.age, g.protagonist.job) }}</p>
        <p class="file__sub">{{ g.protagonist.trait }} · {{ lifeStage(g.age).toLowerCase() }}</p>
      </div>
    </div>
    <dl class="file__grid">
      <div><dt>Сектор</dt><dd>{{ home.name }} {{ home.deck }}</dd></div>
      <div><dt>Достаток семьи</dt><dd class="file__dots"><WealthPips :wealth="g.birth.wealth" /></dd></div>
      <div><dt>Живёт</dt><dd>{{ lives }}</dd></div>
      <div><dt>Статус</dt><dd>{{ g.stopped ? 'архив закрыт' : 'на борту' }}</dd></div>
    </dl>
  </PaperCard>
</template>

<style scoped>
.file { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
.file__id { min-width: 0; display: grid; gap: 2px; }
.file__name { font: 600 22px/1.1 var(--font-display); margin-bottom: 2px; }
.file__sub { font-size: 12.5px; color: var(--ink-soft); }
.file__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 12px 0 0; padding-top: 10px; border-top: 2px dashed var(--paper-line); }
.file__grid dt { font: 500 9.5px/1.2 var(--font-mono); letter-spacing: 1px; text-transform: uppercase; color: #7a6a50; }
.file__grid dd { margin: 1px 0 0; font-weight: 600; font-size: 13px; overflow-wrap: anywhere; }
.file__dots { color: #8a5a12; }
</style>
