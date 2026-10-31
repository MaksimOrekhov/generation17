<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import { deathNoticeGender, deathNoticeText } from '../../domain/deathNotices'
import Panel from '../common/Panel.vue'

const emit = defineEmits<{ openChronicle: []; hidden: [] }>()
const store = useGameStore()
const expanded = ref(false)
const multiple = computed(() => store.pendingDeathNotices.length > 1)
const liveAnnouncement = computed(() => `Непрочитанных известий о близких: ${store.pendingDeathNotices.length}.`)

function hideNotices() {
  if (store.acknowledgeDeathNotices()) emit('hidden')
}
</script>

<template>
  <Panel v-if="store.pendingDeathNotices.length" class="death-notices" :title="store.pendingDeathNotices.length === 1 ? 'Известие о близких' : `Известия о близких · ${store.pendingDeathNotices.length}`">
    <p role="status" aria-live="polite" aria-atomic="true" class="death-notices__announcement">{{ liveAnnouncement }}</p>
    <div class="death-notices__body">
      <div v-if="multiple" class="death-notices__summary">
        <span>Непрочитанных известий: {{ store.pendingDeathNotices.length }}.</span>
        <button class="btn btn--sm btn--ghost" :aria-expanded="expanded" aria-controls="death-notices-list" @click="expanded = !expanded">
          {{ expanded ? 'Свернуть' : 'Развернуть' }}
        </button>
      </div>
      <ul id="death-notices-list" v-show="!multiple || expanded" class="death-notices__list" :class="{ 'death-notices__list--many': multiple }">
        <li v-for="notice in store.pendingDeathNotices" :key="notice.personId" class="death-notices__item">
          <p>{{ deathNoticeText(notice, deathNoticeGender(store.game, notice)) }}</p>
          <small>{{ notice.role }} · год полёта {{ notice.shipYear }}</small>
        </li>
      </ul>
      <div class="death-notices__actions">
        <button class="btn btn--sm" @click="hideNotices">Скрыть</button>
        <button class="btn btn--sm btn--ghost" @click="emit('openChronicle')">Показать записи в летописи</button>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.death-notices { border-color: var(--amber-dim); }
.death-notices__announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.death-notices__body { padding: 12px; }
.death-notices__summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; color: var(--text); font-size: 13px; }
.death-notices__list { display: grid; gap: 12px; }
.death-notices__list--many { max-height: 12rem; overflow-y: auto; overscroll-behavior: contain; padding-right: 6px; }
.death-notices__item { min-width: 0; padding-left: 12px; border-left: 2px solid var(--amber); }
.death-notices__item p { overflow-wrap: anywhere; font-size: 14px; line-height: 1.5; color: var(--text); }
.death-notices__item small { display: block; margin-top: 3px; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; line-height: 1.5; }
.death-notices__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
@media (prefers-reduced-motion: reduce) {
  .death-notices * { scroll-behavior: auto !important; }
}
</style>
