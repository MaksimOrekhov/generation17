<script setup lang="ts">
import { LIFE_TARGETS, jumpToLifeTarget, type LifeTargetId } from '../../ui/lifeNav'

const props = defineProps<{ hasForks: boolean; blocked: boolean }>()

function go(id: LifeTargetId, event: Event) {
  event.preventDefault()
  if (props.blocked) return
  jumpToLifeTarget(id, { blocked: props.blocked })
}
</script>

<template>
  <nav class="lifenav" aria-label="Ориентиры жизни" :inert="blocked || undefined">
    <a class="lifenav__item" :href="`#${LIFE_TARGETS.family}`" @click="go(LIFE_TARGETS.family, $event)">Близкие</a>
    <a v-if="hasForks" class="lifenav__item" :href="`#${LIFE_TARGETS.forks}`" @click="go(LIFE_TARGETS.forks, $event)">Развилки</a>
    <span v-else class="lifenav__item lifenav__item--off">Развилок пока нет</span>
    <a class="lifenav__item" :href="`#${LIFE_TARGETS.ship}`" @click="go(LIFE_TARGETS.ship, $event)">Корабль</a>
    <a class="lifenav__item" :href="`#${LIFE_TARGETS.memory}`" @click="go(LIFE_TARGETS.memory, $event)">Память</a>
  </nav>
</template>

<style scoped>
.lifenav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.lifenav__item { display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 6px 10px; text-align: center; font: 500 14px/1.25 var(--font-body, inherit); color: var(--text); background: var(--panel); border: 1px solid var(--line); text-decoration: none; overflow-wrap: anywhere; }
a.lifenav__item:hover { border-color: var(--amber-dim); }
a.lifenav__item:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.lifenav__item--off { color: var(--muted); border-style: dashed; }
@media (max-width: 640px) { .lifenav { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 320px) { .lifenav { grid-template-columns: minmax(0, 1fr); } }
</style>
