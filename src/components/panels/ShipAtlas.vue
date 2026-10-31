<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SectorId } from '../../domain/types'
import { drawPilgrimArkV2 } from '../../render/pilgrimArkV2'
import { drawShipAtlasSector } from '../../render/shipAtlas'
import type { Ctx } from '../../render/draw'
import { useGameStore } from '../../stores/game'
import { shipAtlasSector, shipAtlasSectors, SHIP_ATLAS_DETAIL_NOTE, SHIP_ATLAS_OVERVIEW_NOTE, SHIP_ATLAS_UNKNOWN_LOCATION } from '../../ui/shipAtlas'

const store = useGameStore()
const open = ref(false)
const selected = ref<SectorId | null>(null)
const sectors = computed(() => shipAtlasSectors(store.game))
const activeSector = computed(() => selected.value ? shipAtlasSector(store.game, selected.value) : null)
const shipCanvas = ref<HTMLCanvasElement | null>(null)
const sectorCanvas = ref<HTMLCanvasElement | null>(null)
const openButton = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const backButton = ref<HTMLButtonElement | null>(null)
const sectorButtons = new Map<SectorId, HTMLButtonElement>()

let frameId: number | null = null
let elapsed = 0
let previousFrame: number | null = null
let hidden = false
let reducedMotion = false
let media: MediaQueryList | null = null

function setSectorButton(id: SectorId, element: Element | null) {
  if (element instanceof HTMLButtonElement) sectorButtons.set(id, element)
  else sectorButtons.delete(id)
}

function drawFrame(seconds: number, motion: boolean) {
  if (!open.value) return
  const canvas = selected.value ? sectorCanvas.value : shipCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  ctx.imageSmoothingEnabled = false
  if (selected.value) drawShipAtlasSector(ctx as Ctx, selected.value, seconds, motion)
  else drawPilgrimArkV2(ctx as Ctx, seconds, motion)
}

function stopAnimation() {
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
  previousFrame = null
}

function animate(timestamp: number) {
  frameId = null
  if (!open.value || hidden || reducedMotion) return
  if (previousFrame !== null) elapsed += Math.max(0, timestamp - previousFrame) / 1000
  previousFrame = timestamp
  drawFrame(elapsed, true)
  frameId = requestAnimationFrame(animate)
}

function syncRenderer() {
  stopAnimation()
  if (!open.value) return
  drawFrame(elapsed, false)
  if (!hidden && !reducedMotion) frameId = requestAnimationFrame(animate)
}

function openAtlas() {
  selected.value = null
  elapsed = 0
  open.value = true
  void nextTick(() => closeButton.value?.focus())
}

function closeAtlas() {
  open.value = false
  selected.value = null
  elapsed = 0
  void nextTick(() => openButton.value?.focus())
}

function viewSector(id: SectorId) {
  selected.value = id
  void nextTick(() => backButton.value?.focus())
}

function backToOverview() {
  const returnTo = selected.value
  selected.value = null
  void nextTick(() => {
    if (returnTo) sectorButtons.get(returnTo)?.focus()
  })
}

function updateReducedMotion(event?: MediaQueryListEvent) {
  reducedMotion = event?.matches ?? media?.matches ?? false
  syncRenderer()
}

function updateVisibility() {
  hidden = document.hidden
  syncRenderer()
}

watch([open, selected], syncRenderer, { flush: 'post' })
// A new life can have a different home. Keep the atlas local and return it to L1.
watch(() => store.game.seed, () => { selected.value = null })

onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = media.matches
  hidden = document.hidden
  media.addEventListener('change', updateReducedMotion)
  document.addEventListener('visibilitychange', updateVisibility)
  syncRenderer()
})

onBeforeUnmount(() => {
  stopAnimation()
  media?.removeEventListener('change', updateReducedMotion)
  document.removeEventListener('visibilitychange', updateVisibility)
})
</script>

<template>
  <section class="ship-atlas" aria-label="Атлас корабля">
    <button
      ref="openButton"
      class="ship-atlas__open"
      type="button"
      :aria-expanded="open"
      aria-controls="ship-atlas-content"
      @click="openAtlas"
    >
      <span aria-hidden="true" class="ship-atlas__glyph">▧</span>
      Карта корабля
      <span aria-hidden="true" class="ship-atlas__chevron">{{ open ? '−' : '+' }}</span>
    </button>

    <div v-if="open" id="ship-atlas-content" class="ship-atlas__content">
      <div class="ship-atlas__toolbar">
        <span class="ship-atlas__crumb">{{ activeSector ? 'СЕКТОР / ILLUSTRATIVE' : 'КОРАБЛЬ / ILLUSTRATIVE' }}</span>
        <button ref="closeButton" class="ship-atlas__close" type="button" @click="closeAtlas">Закрыть карту</button>
      </div>

      <template v-if="!activeSector">
        <figure class="ship-atlas__figure">
          <canvas ref="shipCanvas" width="480" height="270" aria-hidden="true" />
          <figcaption>Пилигрим · A+C Refined v2.0</figcaption>
        </figure>
        <p class="ship-atlas__location"><span>Дом:</span> {{ sectors.find(sector => sector.isHome)?.name }}</p>
        <p class="ship-atlas__unknown">{{ SHIP_ATLAS_UNKNOWN_LOCATION }}</p>
        <p class="ship-atlas__note">{{ SHIP_ATLAS_OVERVIEW_NOTE }}</p>
        <nav class="ship-atlas__sectors" aria-label="Сектора корабля">
          <button
            v-for="sector in sectors"
            :key="sector.id"
            :ref="element => setSectorButton(sector.id, element as Element | null)"
            class="ship-atlas__sector"
            type="button"
            :aria-label="`Изучить ${sector.name}, код ${sector.code}`"
            @click="viewSector(sector.id)"
          >
            <span class="ship-atlas__sector-code">{{ sector.code }}</span>
            <span class="ship-atlas__sector-name">{{ sector.name }}</span>
            <span v-if="sector.isHome" class="ship-atlas__home">Дом</span>
          </button>
        </nav>
      </template>

      <template v-else>
        <button ref="backButton" class="ship-atlas__back" type="button" @click="backToOverview">← Все сектора</button>
        <header class="ship-atlas__sector-heading">
          <div>
            <p class="ship-atlas__sector-code">{{ activeSector.code }} · ILLUSTRATIVE</p>
            <h4>{{ activeSector.name }}</h4>
          </div>
          <span v-if="activeSector.isHome" class="ship-atlas__home">Дом</span>
        </header>
        <p class="ship-atlas__blurb">{{ activeSector.blurb }}</p>
        <figure class="ship-atlas__figure ship-atlas__figure--sector">
          <canvas ref="sectorCanvas" width="480" height="270" aria-hidden="true" />
          <figcaption>Условная пиксельная иллюстрация, не план помещений</figcaption>
        </figure>
        <h5 class="ship-atlas__landmarks-title">Ориентиры сектора</h5>
        <ul class="ship-atlas__landmarks">
          <li v-for="landmark in activeSector.landmarks" :key="landmark">{{ landmark }}</li>
        </ul>
        <p class="ship-atlas__unknown">{{ SHIP_ATLAS_DETAIL_NOTE }}</p>
        <p class="ship-atlas__unknown">{{ SHIP_ATLAS_UNKNOWN_LOCATION }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.ship-atlas { border-top: 1px solid var(--line); }
.ship-atlas button { font: inherit; }
.ship-atlas button:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.ship-atlas__open { width: 100%; display: flex; align-items: center; gap: 9px; padding: 11px 12px; color: var(--text); background: var(--panel-2); border: 0; cursor: pointer; text-align: left; font-weight: 600 !important; }
.ship-atlas__open:hover, .ship-atlas__close:hover, .ship-atlas__back:hover, .ship-atlas__sector:hover { background: var(--panel-3); }
.ship-atlas__glyph { color: var(--amber); font-size: 16px; }
.ship-atlas__chevron { margin-left: auto; color: var(--amber); font: 600 18px var(--font-mono); }
.ship-atlas__content { display: grid; gap: 8px; padding: 9px 10px 12px; }
.ship-atlas__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ship-atlas__crumb, .ship-atlas__sector-code { color: var(--faint); font: 500 9px/1.4 var(--font-mono); letter-spacing: .7px; }
.ship-atlas__close, .ship-atlas__back { padding: 5px 8px; color: var(--text-soft); background: var(--panel); border: 1px solid var(--line); cursor: pointer; font-size: 11px !important; }
.ship-atlas__figure { margin: 0; border: 1px solid var(--line); background: #070620; }
.ship-atlas__figure canvas { display: block; width: 100%; height: auto; image-rendering: pixelated; image-rendering: crisp-edges; }
.ship-atlas__figure figcaption { padding: 4px 6px; color: var(--muted); background: var(--panel-2); font: 10px/1.4 var(--font-mono); }
.ship-atlas__location { margin: 0; color: var(--text); font-weight: 600; }
.ship-atlas__location span { color: var(--amber); }
.ship-atlas__unknown, .ship-atlas__note, .ship-atlas__blurb { margin: 0; color: var(--muted); font-size: 11.5px; line-height: 1.45; overflow-wrap: anywhere; }
.ship-atlas__note { padding: 6px 7px; color: var(--text-soft); background: var(--panel-2); border-left: 2px solid var(--steel); }
.ship-atlas__sectors { display: grid; gap: 5px; }
.ship-atlas__sector { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 6px; min-height: 34px; padding: 5px 7px; color: var(--text-soft); background: var(--panel); border: 1px solid var(--line); cursor: pointer; text-align: left; }
.ship-atlas__sector-code { color: var(--cool); font: 500 10px var(--font-mono); }
.ship-atlas__sector-name { font-size: 11.5px; line-height: 1.3; overflow-wrap: anywhere; }
.ship-atlas__home { width: fit-content; padding: 2px 5px; color: #ffe3b0; background: #4a3425; border: 1px solid var(--amber-dim); font: 500 9px var(--font-mono); }
.ship-atlas__sector-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ship-atlas__sector-heading h4 { margin: 2px 0 0; color: var(--text); font: 600 15px/1.2 var(--font-display); }
.ship-atlas__sector-heading .ship-atlas__sector-code { margin: 0; }
.ship-atlas__landmarks-title { margin: 2px 0 -4px; color: var(--text-soft); font-size: 12px; font-weight: 600; }
.ship-atlas__landmarks { display: grid; gap: 3px; margin: 0; padding-left: 18px; color: var(--text); font-size: 11.5px; line-height: 1.35; }
.ship-atlas__landmarks li::marker { color: var(--amber); }
</style>
