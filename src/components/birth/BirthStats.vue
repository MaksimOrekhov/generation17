<script setup lang="ts">
import { computed } from 'vue'
import { sectors } from '../../domain/birth'
import type { Birth } from '../../domain/types'
import Panel from '../common/Panel.vue'

const props = defineProps<{ birth: Birth }>()
const max = computed(() => Math.max(...Object.values(props.birth.births)))
const oneIn = computed(() => Math.max(1, Math.round(props.birth.birthsThisYear / Math.max(1, props.birth.sectorBirths))))
</script>

<template>
  <Panel title="Рождения этого года" :aside="`${birth.birthsThisYear} человек`">
    <div class="bs">
      <p class="bs__fact">
        В вашем секторе родилось <b>{{ birth.sectorBirths }}</b> из {{ birth.birthsThisYear }} младенцев, примерно <b>1 из {{ oneIn }}</b>.
        Семей с таким достатком на корабле около <b>{{ birth.wealthShare }}%</b>.
      </p>
      <ul class="bs__bars">
        <li v-for="s in sectors" :key="s.id" :class="{ 'bs__row--you': s.id === birth.sectorId }">
          <span class="bs__name">{{ s.name }} {{ s.deck }}</span>
          <div class="bs__bar"><i :style="{ width: `${birth.births[s.id] / max * 100}%` }" /></div>
          <b>{{ birth.births[s.id] }}</b>
        </li>
      </ul>
    </div>
  </Panel>
</template>

<style scoped>
.bs { display: grid; gap: 12px; padding: 12px; }
.bs__fact { font-size: 14px; line-height: 1.55; color: var(--text-soft); }
.bs__fact b { color: var(--amber); font-weight: 600; }
.bs__bars { display: grid; gap: 7px; }
.bs__bars li { display: grid; grid-template-columns: minmax(0, 170px) minmax(0, 1fr) 30px; gap: 10px; align-items: center; font-size: 12.5px; color: var(--muted); }
.bs__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bs__bar { height: 10px; background: #0f0d19; border: 1px solid var(--line); }
.bs__bar i { display: block; height: 100%; background: var(--line-2); }
.bs__bars b { font: 500 12px var(--font-mono); text-align: right; }
.bs__row--you { color: var(--text); font-weight: 600; }
.bs__row--you .bs__bar i { background: repeating-linear-gradient(90deg, var(--amber) 0 5px, var(--amber-2) 5px 6px); }
@media (max-width: 520px) { .bs__bars li { grid-template-columns: 110px minmax(0, 1fr) 28px; } }
</style>
