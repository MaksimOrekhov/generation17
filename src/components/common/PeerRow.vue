<script setup lang="ts">
import { computed } from 'vue'
import { sectorById } from '../../domain/birth'
import type { Peer } from '../../domain/types'
import { years } from '../../ui/format'
import PixelPortrait from './PixelPortrait.vue'
import WealthPips from './WealthPips.vue'

const props = defineProps<{ peer: Peer; age: number }>()
const sector = computed(() => sectorById(props.peer.sectorId))
const state = computed(() => {
  if (!props.peer.alive) return `ушёл(ла) в ${years(props.peer.diedAt ?? 0)}`
  if (props.peer.job) return `${years(props.age)} · ${props.peer.job.toLowerCase()}`
  return years(props.age)
})
</script>

<template>
  <li class="peer" :class="{ 'peer--gone': !peer.alive }">
    <PixelPortrait :name="peer.name" :age="peer.alive ? age : (peer.diedAt ?? 0)" :width="32" />
    <div class="peer__info">
      <b class="wrap">{{ peer.name }}</b>
      <small>{{ sector.name }} {{ sector.deck }}</small>
    </div>
    <div class="peer__side">
      <span class="peer__dots" :title="`Достаток: ${peer.wealth} из 5`"><WealthPips :wealth="peer.wealth" :size="6" /></span>
      <small>{{ state }}</small>
    </div>
  </li>
</template>

<style scoped>
.peer { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.peer--gone { opacity: .55; }
.peer__info { display: grid; min-width: 0; }
.peer__info b { font-weight: 600; font-size: 13px; }
.peer__info small, .peer__side small { color: var(--muted); font-size: 11.5px; }
.peer__side { display: grid; justify-items: end; text-align: right; }
.peer__dots { color: var(--amber); line-height: 1; }
</style>
