<script setup lang="ts">
import { computed } from 'vue'
import { childLifeStage } from '../../domain/people'
import { currentPartner, relationshipState } from '../../domain/people'
import { genderOfName, sectorById } from '../../domain/birth'
import { years } from '../../ui/format'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'
import PixelPortrait from '../common/PixelPortrait.vue'

const store = useGameStore()
// Люди появляются в жизни героя постепенно: друг — в детском саду, наставник — к 16 годам.
const people = computed(() => store.game.people.filter(p => store.game.age >= p.since))
const status = (id: string, alive: boolean) => {
  const person = store.game.people.find(candidate => candidate.id === id)
  const female = (person?.gender ?? (person ? genderOfName(person.name) : 'm')) === 'f'
  return alive ? female ? 'жива' : 'жив' : female ? 'умерла' : 'умер'
}
const hearts = (bond: number) => Math.max(0, Math.min(5, Math.ceil(bond / 20)))
const childStages = { 'early-childhood': 'раннее детство', 'school-age': 'школьный возраст', youth: 'юность', adult: 'взрослая жизнь' } as const
const circumstances = (id: string) => {
  const p = store.game.people.find(person => person.id === id)!
  const labels: string[] = []
  if (currentPartner(store.game)?.id === id) labels.push('партнёр')
  else if (relationshipState(store.game).formerPartnerIds.includes(id)) labels.push(p.alive ? 'бывший партнёр' : 'ранее были партнёрами')
  if (p.alive && p.state?.sectorId) labels.push(sectorById(p.state.sectorId)?.name ?? p.state.sectorId)
  if (p.alive && p.state?.job) labels.push(p.state.job)
  if (p.alive && p.state?.availability === 'distant') labels.push('нет на связи')
  if (p.alive && p.state?.familyStatus === 'single') labels.push('не состоит в семье')
  if (p.alive && p.state?.familyStatus === 'family') labels.push('есть своя семья')
  return labels.join(' · ')
}
</script>

<template>
  <Panel title="Близкие люди" :aside="`${people.filter(p => p.alive).length} из ${people.length}`">
    <ul>
      <li v-for="p in people" :key="p.id" class="person" :class="{ 'person--gone': !p.alive }">
        <PixelPortrait :name="p.name" :age="p.age" :width="32" />
        <div class="person__info">
          <b class="wrap">{{ p.name }}</b>
          <small>{{ p.role }} · {{ status(p.id, p.alive) }}<template v-if="!p.alive"> · возраст на момент смерти: {{ years(p.age) }}</template></small>
          <small v-if="p.id === 'child' && p.alive">{{ childStages[childLifeStage(p.age)] }}</small>
          <small v-if="circumstances(p.id)">{{ circumstances(p.id) }}</small>
        </div>
        <span v-if="p.alive" class="person__bond" :class="{ 'person__bond--low': p.bond < 30 }" :title="`Доверие: ${Math.round(p.bond)}%`">
          {{ '♥'.repeat(hearts(p.bond)) }}<i>{{ '♥'.repeat(5 - hearts(p.bond)) }}</i>
        </span>
      </li>
    </ul>
    <p class="family__hint">Отношения формируют будущие возможности, но не сводятся к одному числу.</p>
  </Panel>
</template>

<style scoped>
.person { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.person--gone { opacity: .5; filter: grayscale(1); }
.person__info { display: grid; min-width: 0; }
.person__info b { font-weight: 600; font-size: 13px; }
.person__info small { color: var(--muted); font-size: 11.5px; }
.person__bond { font: 500 11px var(--font-mono); color: var(--amber); letter-spacing: 1px; white-space: nowrap; }
.person__bond i { font-style: normal; color: var(--line-2); }
.person__bond--low { color: var(--bad); }
.family__hint { padding: 8px 12px 10px; font-size: 12px; color: var(--faint); }
</style>
