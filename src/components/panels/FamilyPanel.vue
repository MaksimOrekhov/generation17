<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import Panel from '../common/Panel.vue'
import PixelPortrait from '../common/PixelPortrait.vue'

const store = useGameStore()
// Люди появляются в жизни героя постепенно: друг — в детском саду, наставник — к 16 годам.
const people = computed(() => store.game.people.filter(p => store.game.age >= p.since))
const hearts = (bond: number) => Math.max(0, Math.min(5, Math.ceil(bond / 20)))
</script>

<template>
  <Panel title="Близкие люди" :aside="`${people.filter(p => p.alive).length} из ${people.length}`">
    <ul>
      <li v-for="p in people" :key="p.id" class="person" :class="{ 'person--gone': !p.alive }">
        <PixelPortrait :name="p.name" :age="p.age" :width="32" />
        <div class="person__info">
          <b class="wrap">{{ p.name }}</b>
          <small>{{ p.role }} · {{ p.alive ? `${p.age}` : 'ушёл(ла)' }}</small>
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
