import type { SectorId, SpotId } from '../domain/types'
import { sectorById } from '../domain/birth'
import type { Ctx } from './draw'
import { cabinScene } from './cabin'

export const SCENE_W = 480
export const SCENE_H = 270

export type SceneId = 'home.cabin' | 'event.neutral' | 'edu.archive' | 'bio.greenhouse' | 'public.observation'
export type ScenePresentation = 'home' | 'illustration' | 'neutral'

export interface SceneContext {
  started: boolean
  momentId: string | null
  momentSpot: SpotId | null
  pendingStorylet: boolean
  hasDecision: boolean
  resultVisible: boolean
  stopped: boolean
  shopOpen: boolean
  residenceSectorId: SectorId
}

export interface SceneResolution {
  sceneId: SceneId
  presentation: ScenePresentation
  label: string
  ariaLabel: string
  spot: SpotId | null
  fallbackReason: 'pending-storylet' | 'decision' | 'result' | 'ended' | 'unsupported-moment' | null
}

/** Everything supplied to a renderer is already a display-safe snapshot. */
export interface SceneModel {
  name: string
  age: number
  wealth: number
  sectorId: SectorId
  companion: { name: string; age: number; kind: 'parent' | 'partner' } | null
  scene: SceneResolution
}

export interface SceneRenderer {
  id: SceneId
  /** `t` is cosmetic animation time in seconds. t=0 is a deterministic complete frame. */
  draw(ctx: Ctx, t: number, model: SceneModel): void
}

const EVENT_SCENES: Record<string, { sceneId: SceneId; label: string; ariaLabel: string; spot: SpotId | null }> = {
  'm-night-archive': { sceneId: 'edu.archive', label: 'Иллюстрация: учебный архив', ariaLabel: 'Иллюстрация ночного учебного архива: свободный терминал и приглушённый свет', spot: 'terminal' },
  'm-job-agro': { sceneId: 'bio.greenhouse', label: 'Иллюстрация: биокупол', ariaLabel: 'Иллюстрация биокупола с пустой грядкой', spot: null },
  'm-night-deck': { sceneId: 'public.observation', label: 'Иллюстрация: обзорная палуба', ariaLabel: 'Иллюстрация пустой обзорной галереи с видом на звёзды', spot: 'window' }
}

const illustration = (event: NonNullable<typeof EVENT_SCENES[string]>, requestedSpot: SpotId | null): SceneResolution => ({
  sceneId: event.sceneId,
  presentation: 'illustration',
  label: event.label,
  ariaLabel: event.ariaLabel,
  // The archive terminal and observation glass share the event's named anchor. A houseplant is not a garden bed.
  spot: event.spot === requestedSpot ? event.spot : null,
  fallbackReason: null
})

function neutral(reason: SceneResolution['fallbackReason']): SceneResolution {
  return {
    sceneId: 'event.neutral', presentation: 'neutral',
    label: 'Иллюстрация · место не установлено',
    ariaLabel: 'Нейтральная иллюстрация корабельного коридора; место действия не установлено',
    spot: null, fallbackReason: reason
  }
}

/** Exact, curated event IDs only. Narrative context never implies that the protagonist moved. */
export function resolveScene(context: SceneContext): SceneResolution {
  if (context.pendingStorylet) return neutral('pending-storylet')
  if (context.hasDecision || context.shopOpen) return neutral('decision')
  if (context.resultVisible) return neutral('result')
  if (context.stopped) return neutral('ended')
  if (context.momentId) {
    const event = EVENT_SCENES[context.momentId]
    return event ? illustration(event, context.momentSpot) : neutral('unsupported-moment')
  }
  return {
    sceneId: 'home.cabin', presentation: 'home',
    label: `Каюта · ${sectorById(context.residenceSectorId).name}`,
    ariaLabel: `Домашняя каюта в секторе «${sectorById(context.residenceSectorId).name}»`,
    spot: null, fallbackReason: null
  }
}

const px = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string, alpha = 1) => {
  if (alpha !== 1) ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  if (alpha !== 1) ctx.globalAlpha = 1
}

function highlight(ctx: Ctx, x: number, y: number, w: number, h: number, t: number) {
  const alpha = .35 + .22 * Math.sin(t * 4)
  const color = '#ffd08a'
  px(ctx, x, y, 12, 2, color, alpha); px(ctx, x, y, 2, 12, color, alpha)
  px(ctx, x + w - 12, y, 12, 2, color, alpha); px(ctx, x + w - 2, y, 2, 12, color, alpha)
  px(ctx, x, y + h - 2, 12, 2, color, alpha); px(ctx, x, y + h - 12, 2, 12, color, alpha)
  px(ctx, x + w - 12, y + h - 2, 12, 2, color, alpha); px(ctx, x + w - 2, y + h - 12, 2, 12, color, alpha)
}

function drawNeutral(ctx: Ctx) {
  px(ctx, 0, 0, 480, 270, '#111522')
  px(ctx, 0, 0, 480, 28, '#090d16'); px(ctx, 0, 27, 480, 3, '#30384b')
  // Receding ribs and ceiling lights give this an unmistakable ship interior without naming a destination.
  for (let i = 0; i < 6; i++) {
    const x = 24 + i * 86
    px(ctx, x, 31, 4, 95, '#252d3d'); px(ctx, x + 4, 31, 1, 95, '#46536a', .65)
    px(ctx, x + 18, 34, 38, 3, '#68758c', .45); px(ctx, x + 20, 38, 34, 1, '#d7d0b3', .3)
  }
  // A distant pressure door anchors the vanishing point; the sealed panels carry no destination marking.
  px(ctx, 188, 55, 104, 73, '#354052'); px(ctx, 194, 60, 92, 68, '#101824')
  px(ctx, 201, 65, 78, 61, '#1b2634'); px(ctx, 204, 68, 72, 54, '#263143')
  px(ctx, 208, 72, 64, 47, '#17212d'); px(ctx, 267, 86, 2, 9, '#c6ac72')
  px(ctx, 197, 122, 87, 4, '#7f8b9c'); px(ctx, 203, 126, 75, 2, '#111720')
  // Recessed ceiling services and small status lamps add scale to the corridor.
  px(ctx, 196, 31, 88, 5, '#181d29'); px(ctx, 202, 32, 76, 2, '#728091', .55)
  for (const [x, color] of [[202, '#76a89b'], [211, '#d3ae6e'], [270, '#7894a5']] as const) {
    px(ctx, x, 42, 4, 2, color, .7); px(ctx, x + 1, 44, 2, 3, color, .27)
  }
  px(ctx, 0, 124, 480, 57, '#1a2130'); px(ctx, 0, 125, 480, 2, '#4b5668')
  // Two unlabelled maintenance panels; no readable destination or false room marker.
  for (const x of [36, 382]) {
    px(ctx, x, 67, 54, 48, '#101622'); px(ctx, x + 3, 70, 48, 42, '#202b3b')
    px(ctx, x + 8, 77, 30, 2, '#718394', .55); px(ctx, x + 8, 84, 38, 1, '#465c6d')
    px(ctx, x + 8, 93, 19, 4, '#629b9a', .45); px(ctx, x + 34, 93, 10, 4, '#c5a56e', .5)
  }
  px(ctx, 0, 180, 480, 90, '#20202e'); px(ctx, 0, 180, 480, 2, '#697182')
  for (let y = 195; y < 270; y += 17) px(ctx, 0, y, 480, 1, '#313142')
  for (let x = -120; x < 600; x += 80) {
    const vanishingX = 240 + (x - 240) * .27
    for (let y = 182; y < 270; y += 2) {
      const spread = (y - 182) / 88
      px(ctx, vanishingX + (x - vanishingX) * spread, y, 1, 1, '#303044', .7)
    }
  }
  // Inlaid guide strips taper toward the pressure door.
  for (let y = 185; y < 260; y += 3) {
    const spread = (y - 185) / 75
    px(ctx, 240 - 62 * spread, y, 2 + 8 * spread, 1, '#82aaa6', .2 + .1 * spread)
    px(ctx, 240 + 60 * spread, y, 2 + 8 * spread, 1, '#82aaa6', .2 + .1 * spread)
  }
  // Wall-side handrails and soft sconces make the space feel maintained, not abandoned.
  for (const side of [0, 438]) {
    px(ctx, side, 138, 42, 4, '#586577'); px(ctx, side + 4, 142, 34, 3, '#30394a')
    px(ctx, side + 8, 71, 4, 12, '#c6b68f', .7); px(ctx, side + 5, 78, 10, 3, '#e4ce9e', .2)
  }
  px(ctx, 222, 52, 36, 3, '#e7d7b0', .45); px(ctx, 228, 59, 24, 2, '#b5c2d0', .3)
  px(ctx, 0, 265, 480, 5, '#090d16')
}

function drawArchive(ctx: Ctx, t: number, spot: SpotId | null) {
  px(ctx, 0, 0, 480, 270, '#17151d')
  px(ctx, 0, 0, 480, 24, '#0b0c12'); px(ctx, 0, 24, 480, 3, '#49404a')
  // Old vent trunk, acoustic panels and warm task lamps.
  px(ctx, 0, 29, 480, 5, '#252029'); px(ctx, 0, 33, 480, 2, '#57483c', .75)
  for (let x = 229; x < 460; x += 34) {
    px(ctx, x, 31, 22, 2, '#d4a868', .55); px(ctx, x + 2, 34, 18, 1, '#ffdb96', .24)
  }
  for (let x = 225; x < 461; x += 58) px(ctx, x, 42, 1, 111, '#6b5140', .28)
  // Deep archive stacks, alternating warm metal edges and shadowed bays.
  for (let x = 12; x < 214; x += 54) {
    px(ctx, x, 38, 44, 117, '#29232b'); px(ctx, x + 2, 40, 40, 111, '#3d3030')
    for (let y = 49; y < 148; y += 24) {
      px(ctx, x + 4, y, 36, 2, '#9a7650'); px(ctx, x + 5, y + 3, 33, 16, '#211d25')
      for (let j = 0; j < 4; j++) px(ctx, x + 7 + j * 8, y + 5 + (j % 2) * 2, 5, 10, j % 2 ? '#665048' : '#6f6050')
      px(ctx, x + 4, y + 20, 36, 1, '#c09a65', .65)
    }
    px(ctx, x, 38, 2, 117, '#ad865d', .7)
  }
  // Quiet pool of amber light at the terminal; screen shows an idle catalog, never a completed lesson.
  px(ctx, 251, 55, 200, 111, '#30252b'); px(ctx, 256, 60, 190, 102, '#201d26')
  px(ctx, 277, 69, 144, 76, '#080f18'); px(ctx, 280, 72, 138, 70, '#12212b')
  px(ctx, 280, 72, 138, 2, '#a57b52'); px(ctx, 284, 80, 46, 3, '#d9b77e', .75)
  for (let y = 89; y < 128; y += 10) {
    px(ctx, 286, y, 72 + (y % 3) * 7, 2, '#86a5a1', .57)
    px(ctx, 396, y, 14, 2, '#c69b60', .56)
  }
  px(ctx, 294, 166, 124, 7, '#51413b'); px(ctx, 306, 173, 102, 4, '#30282c')
  // Reading desk and one untouched slate.
  px(ctx, 249, 184, 202, 9, '#715640'); px(ctx, 249, 184, 202, 2, '#c09a65')
  px(ctx, 260, 193, 7, 52, '#44352f'); px(ctx, 434, 193, 7, 52, '#44352f')
  px(ctx, 310, 177, 35, 4, '#d3bd91'); px(ctx, 313, 178, 25, 1, '#6d7776')
  // Empty reading stool, closed folios and a lamp turned toward the available terminal.
  px(ctx, 376, 202, 38, 7, '#8a6748'); px(ctx, 380, 209, 4, 22, '#51413b'); px(ctx, 407, 209, 4, 22, '#51413b')
  px(ctx, 269, 180, 25, 3, '#aa8a62'); px(ctx, 272, 177, 19, 3, '#dac397'); px(ctx, 276, 174, 11, 3, '#765a47')
  px(ctx, 230, 166, 3, 19, '#71543c'); px(ctx, 219, 164, 24, 4, '#bc8a50'); px(ctx, 222, 160, 18, 4, '#e3bf77')
  px(ctx, 223, 164, 16, 19, '#ffca72', .09)
  // Narrow amber reflections on the polished desk edge.
  px(ctx, 251, 195, 197, 1, '#e0b16f', .46); px(ctx, 251, 201, 187, 1, '#c9985e', .18)
  for (let i = 0; i < 11; i++) px(ctx, 251 + i * 18, 213 + (i % 2) * 2, 8, 1, '#a47d57', .14)
  px(ctx, 0, 157, 480, 4, '#51413b'); px(ctx, 0, 161, 480, 50, '#231f29')
  for (let x = 0; x < 480; x += 48) px(ctx, x, 164, 2, 46, '#3d3338')
  px(ctx, 0, 208, 480, 62, '#211d27')
  for (let y = 222; y < 270; y += 12) px(ctx, 0, y, 480, 1, '#39303a')
  for (let x = -50; x < 530; x += 64) px(ctx, 234 + (x - 234) * .45, 211, 1, 59, '#3a3038', .8)
  // Dust catches the lamp without moving any story object.
  for (let i = 0; i < 8; i++) {
    const x = 225 + (i * 47 + Math.sin(t * .28 + i * 2) * 5) % 220
    const y = 45 + (i * 19 + t * (2 + i % 3)) % 130
    px(ctx, x, y, 1, 1, '#f2d59b', .38)
  }
  px(ctx, 244, 40, 215, 143, '#ffc66e', .035)
  if (spot === 'terminal') highlight(ctx, 272, 65, 154, 84, t)
  px(ctx, 0, 265, 480, 5, '#0b0c12')
}

function drawGreenhouse(ctx: Ctx, t: number) {
  px(ctx, 0, 0, 480, 270, '#172a2a')
  // Curved glass ribs and a distant, humid garden establish the dome's scale.
  px(ctx, 0, 0, 480, 20, '#102222')
  for (let i = 0; i < 9; i++) {
    const baseX = 24 + i * 54
    for (let y = 24; y < 142; y += 3) {
      const curve = ((y - 24) / 118) ** 1.35 * (baseX < 240 ? 1 : -1) * 12
      const x = baseX + curve
      px(ctx, x, y, 3, 3, '#416a68'); px(ctx, x + 3, y, 1, 2, '#91b9a1', .55)
    }
    px(ctx, baseX - 15, 36, 34, 1, '#71aaa0', .45)
  }
  for (let y = 32; y < 126; y += 30) px(ctx, 0, y, 480, 1, '#5e8980', .35)
  // Condensation, reflected grow-lights and fine service rails across the crown of the dome.
  px(ctx, 31, 47, 95, 2, '#b1c7a1', .18); px(ctx, 148, 54, 124, 2, '#c1cda0', .13); px(ctx, 331, 43, 110, 2, '#b1c7a1', .17)
  for (let x = 42; x < 462; x += 84) {
    px(ctx, x, 24, 24, 2, '#c1a66e', .65); px(ctx, x + 4, 27, 16, 2, '#f1d793', .4)
    px(ctx, x + 7, 29, 10, 1, '#e6edb3', .25)
  }
  px(ctx, 0, 134, 480, 3, '#4c7060'); px(ctx, 0, 138, 480, 1, '#a6b57a', .5)
  // Soft humid light bands and distant foliage.
  px(ctx, 0, 50, 480, 54, '#31534a', .55); px(ctx, 0, 104, 480, 22, '#527052', .5)
  for (let i = 0; i < 18; i++) {
    const x = (i * 73 + 22) % 490
    const y = 107 + (i * 17) % 30
    px(ctx, x, y, 16 + i % 3 * 5, 4, i % 2 ? '#517c51' : '#719252', .72)
    px(ctx, x + 5, y - 7, 3, 8, '#a8b56b', .5)
  }
  // Side beds have established growth; the featured bed in the center is explicitly bare.
  for (const x of [12, 390]) {
    px(ctx, x, 152, 76, 26, '#654839'); px(ctx, x + 2, 152, 72, 5, '#96654a')
    px(ctx, x + 6, 157, 64, 14, '#352d27')
    for (let i = 0; i < 5; i++) {
      const lx = x + 10 + i * 12 + Math.round(Math.sin(t * .8 + i) * 1)
      px(ctx, lx, 141 + i % 2 * 4, 3, 16, '#46774c'); px(ctx, lx - 5, 145 + i % 3, 8, 4, '#79a85c')
      px(ctx, lx + 2, 142 + i % 2, 7, 4, '#a6c16c')
    }
  }
  // A seedling shelf and irrigation rail sit behind the empty experimental bed.
  px(ctx, 68, 147, 50, 3, '#7f7350'); px(ctx, 76, 140, 3, 7, '#436b46'); px(ctx, 73, 138, 9, 3, '#83aa5b')
  px(ctx, 361, 147, 44, 3, '#7f7350'); px(ctx, 379, 139, 3, 8, '#436b46'); px(ctx, 376, 137, 9, 3, '#83aa5b')
  px(ctx, 112, 144, 256, 2, '#9fae75', .65); px(ctx, 118, 140, 4, 4, '#c5bb7f', .75); px(ctx, 359, 140, 4, 4, '#c5bb7f', .75)
  for (let x = 130; x < 351; x += 22) px(ctx, x, 143, 1, 4, '#9fae75', .5)
  // The proposed experiment's bed is empty: dark, freshly turned soil, no seedling or tools in use.
  px(ctx, 119, 149, 242, 37, '#72533f'); px(ctx, 123, 150, 234, 5, '#a47754')
  px(ctx, 128, 155, 224, 22, '#3c3029'); px(ctx, 128, 155, 224, 2, '#594334')
  for (let i = 0; i < 8; i++) px(ctx, 139 + i * 27, 161 + (i % 3) * 3, 10, 1, '#574334', .8)
  px(ctx, 119, 184, 242, 5, '#4f3a31'); px(ctx, 128, 189, 8, 35, '#534134'); px(ctx, 344, 189, 8, 35, '#534134')
  // Floor path with green reflected light.
  px(ctx, 0, 190, 480, 80, '#253b35'); px(ctx, 0, 190, 480, 2, '#8a9b67', .65)
  for (let y = 205; y < 270; y += 14) px(ctx, 0, y, 480, 1, '#34493d')
  for (let x = -150; x < 600; x += 58) px(ctx, 240 + (x - 240) * .7, 191, 1, 79, '#35483d')
  // Dew glints drift gently; the bed itself remains unchanged.
  for (let i = 0; i < 9; i++) {
    const x = (31 + i * 53 + Math.sin(t * .4 + i) * 2) % 470
    const y = 52 + (i * 29) % 78
    px(ctx, x, y, 2, 1, '#d3e6bf', .38 + .12 * Math.sin(t + i))
  }
  px(ctx, 0, 265, 480, 5, '#102222')
}

function drawObservation(ctx: Ctx, t: number, spot: SpotId | null) {
  px(ctx, 0, 0, 480, 270, '#111827')
  // Panoramic reinforced glazing and an intentionally unclaimed field of distant stars.
  px(ctx, 20, 30, 440, 143, '#273445'); px(ctx, 25, 35, 430, 133, '#071320')
  px(ctx, 26, 132, 428, 35, '#0d2030'); px(ctx, 26, 145, 428, 22, '#13283a')
  for (let i = 0; i < 70; i++) {
    const x = 38 + (i * 61) % 410
    const y = 43 + (i * 37) % 88
    const twinkle = .45 + .4 * Math.sin(t * 1.5 + i * 1.7)
    px(ctx, x, y, i % 11 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1, i % 7 === 0 ? '#c6d6e2' : '#f3e7cb', twinkle)
  }
  // Thick mullions and pressure locks frame the view.
  for (const x of [20, 166, 313, 456]) {
    px(ctx, x, 27, 7, 151, '#46515c'); px(ctx, x + 2, 30, 2, 145, '#82909a')
    px(ctx, x - 4, 27, 15, 4, '#b6a582'); px(ctx, x - 4, 174, 15, 4, '#b6a582')
    px(ctx, x + 2, 95, 2, 10, '#d7bb80', .62)
  }
  // Empty gallery: safety rail, low observation benches and instrument console, no figure at glass.
  px(ctx, 0, 180, 480, 3, '#8794a0'); px(ctx, 0, 183, 480, 5, '#3e4a58')
  px(ctx, 0, 178, 480, 1, '#d0bd93', .5); px(ctx, 0, 187, 480, 2, '#141c27')
  px(ctx, 0, 188, 480, 82, '#252b37'); px(ctx, 0, 188, 480, 2, '#697684')
  for (let y = 204; y < 270; y += 14) px(ctx, 0, y, 480, 1, '#38414c')
  for (let x = -90; x < 570; x += 76) px(ctx, 238 + (x - 238) * .43, 190, 1, 80, '#39424d')
  px(ctx, 31, 196, 99, 24, '#111923'); px(ctx, 34, 198, 93, 7, '#1d3340')
  for (let i = 0; i < 6; i++) px(ctx, 39 + i * 13, 201, 6, 1, i % 2 ? '#8eb7b2' : '#c5ad78', .72)
  px(ctx, 336, 195, 113, 23, '#111923'); px(ctx, 339, 198, 107, 6, '#223944')
  px(ctx, 345, 201, 39, 1, '#b6c4b3', .7); px(ctx, 414, 201, 23, 1, '#caa66d', .75)
  // Empty padded seats are part of the room; no visitor is posed at the glass.
  px(ctx, 168, 205, 49, 10, '#3c4653'); px(ctx, 172, 201, 41, 6, '#626b72'); px(ctx, 172, 215, 4, 13, '#38424d'); px(ctx, 210, 215, 4, 13, '#38424d')
  px(ctx, 267, 205, 49, 10, '#3c4653'); px(ctx, 271, 201, 41, 6, '#626b72'); px(ctx, 271, 215, 4, 13, '#38424d'); px(ctx, 309, 215, 4, 13, '#38424d')
  px(ctx, 0, 265, 480, 5, '#0b111b')
  if (spot === 'window') highlight(ctx, 28, 34, 424, 137, t)
}

const neutralScene: SceneRenderer = { id: 'event.neutral', draw: ctx => drawNeutral(ctx) }
const archiveScene: SceneRenderer = { id: 'edu.archive', draw: (ctx, t, m) => drawArchive(ctx, t, m.scene.spot) }
const greenhouseScene: SceneRenderer = { id: 'bio.greenhouse', draw: (ctx, t) => drawGreenhouse(ctx, t) }
const observationScene: SceneRenderer = { id: 'public.observation', draw: (ctx, t, m) => drawObservation(ctx, t, m.scene.spot) }

export const sceneRegistry: Record<SceneId, SceneRenderer> = {
  'home.cabin': cabinScene,
  'event.neutral': neutralScene,
  'edu.archive': archiveScene,
  'bio.greenhouse': greenhouseScene,
  'public.observation': observationScene
}

export function pickScene(model: SceneModel): SceneRenderer {
  return sceneRegistry[model.scene.sceneId]
}
