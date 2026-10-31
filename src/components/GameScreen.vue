<script setup lang="ts">
import { computed, ref } from 'vue'
import { nextTick } from 'vue'
import { useGameLoop } from '../composables/useGameLoop'
import { useHotkeys } from '../composables/useHotkeys'
import { useGameStore } from '../stores/game'
import TopBar from './layout/TopBar.vue'
import SceneView from './scene/SceneView.vue'
import DecisionModal from './play/DecisionModal.vue'
import EndingModal from './play/EndingModal.vue'
import FocusPicker from './play/FocusPicker.vue'
import HelpModal from './play/HelpModal.vue'
import HintCoach from './play/HintCoach.vue'
import NewLifeModal from './play/NewLifeModal.vue'
import SpendModal from './play/SpendModal.vue'
import ChroniclePanel from './panels/ChroniclePanel.vue'
import DeathNotices from './panels/DeathNotices.vue'
import FamilyPanel from './panels/FamilyPanel.vue'
import ForksPanel from './panels/ForksPanel.vue'
import LifeMapPanel from './panels/LifeMapPanel.vue'
import MemoryPanel from './panels/MemoryPanel.vue'
import PeersPanel from './panels/PeersPanel.vue'
import PersonalFile from './panels/PersonalFile.vue'
import ShipPanel from './panels/ShipPanel.vue'
import SkillsPanel from './panels/SkillsPanel.vue'
import StatsPanel from './panels/StatsPanel.vue'
import WorkFinancePanel from './panels/WorkFinancePanel.vue'

const store = useGameStore()
const showHelp = ref(false)
const confirmNew = ref(false)
const endingClosed = ref(false)
const chroniclePanel = ref<InstanceType<typeof ChroniclePanel> | null>(null)

const modalOpen = computed(() => showHelp.value || confirmNew.value || store.shopOpen)
const showEnding = computed(() => store.game.stopped && !store.result && !endingClosed.value && !confirmNew.value)
const showDeathNotices = computed(() => store.pendingDeathNotices.length > 0 && !store.hasDecision && !store.result && !showEnding.value && !store.shopOpen && !showHelp.value && !confirmNew.value)

useGameLoop()
useHotkeys(() => !modalOpen.value)

function fresh() {
  confirmNew.value = false
  endingClosed.value = false
  store.newLife()
}
function repeat() {
  confirmNew.value = false
  endingClosed.value = false
  store.newLife(store.game.seed)
}

async function openNoticeChronicle() {
  const moved = await chroniclePanel.value?.focusMemory()
  await nextTick()
  if (moved) store.acknowledgeDeathNotices()
}

async function restoreNoticeFocus() {
  await nextTick()
  chroniclePanel.value?.focusFirstFilter()
}
</script>

<template>
  <div class="game">
    <TopBar @help="showHelp = true" @new-life="confirmNew = true" />
    <main class="game__layout">
      <div class="game__col game__col--left">
        <PersonalFile />
        <StatsPanel />
        <SkillsPanel />
        <WorkFinancePanel />
      </div>
      <div class="game__col game__col--center">
        <SceneView />
        <DeathNotices v-if="showDeathNotices" @open-chronicle="openNoticeChronicle" @hidden="restoreNoticeFocus" />
        <FocusPicker />
        <ChroniclePanel ref="chroniclePanel" />
      </div>
      <div class="game__col game__col--right">
        <FamilyPanel />
        <PeersPanel />
        <LifeMapPanel />
        <ForksPanel />
        <ShipPanel />
        <MemoryPanel />
      </div>
    </main>
    <footer class="game__foot">
      <span>Поколение 17 · прототип</span>
      <span>seed {{ store.game.seed }}</span>
      <span>локальное сохранение · без сервера</span>
    </footer>

    <DecisionModal />
    <HintCoach />
    <EndingModal v-if="showEnding" @close="endingClosed = true" @new-life="fresh" @repeat="repeat" />
    <button v-else-if="store.game.stopped && !store.result" class="btn btn--primary game__again" @click="fresh">Прожить другую жизнь</button>
    <SpendModal v-if="store.shopOpen" @close="store.closeShop()" />
    <HelpModal v-if="showHelp" @close="showHelp = false" />
    <NewLifeModal v-if="confirmNew" @cancel="confirmNew = false" @fresh="fresh" @repeat="repeat" />
  </div>
</template>

<style scoped>
.game { min-height: 100vh; }
/* Сцена и летопись образуют колонку для чтения, боковые колонки — контекст */
.game__layout { max-width: 1400px; margin: 0 auto; padding: 24px 20px; display: grid; grid-template-columns: 300px minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.game__col { display: grid; gap: 18px; min-width: 0; }
.game__foot { max-width: 1400px; margin: 0 auto; padding: 8px 20px 28px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; font: 400 11px var(--font-mono); color: var(--muted); letter-spacing: .6px; }
.game__again { position: fixed; right: 16px; bottom: 16px; z-index: 40; }

@media (max-width: 1180px) {
  .game__layout { grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
  .game__col--center { grid-column: 1; grid-row: 1 / span 2; }
  .game__col--left { grid-column: 2; grid-row: 1; }
  .game__col--right { grid-column: 2; grid-row: 2; }
}
@media (max-width: 820px) {
  .game__layout { grid-template-columns: minmax(0, 1fr); padding: 16px 12px; }
  .game__col--center, .game__col--left, .game__col--right { grid-column: 1; grid-row: auto; }
  .game__col--center { order: -1; }
}
</style>
