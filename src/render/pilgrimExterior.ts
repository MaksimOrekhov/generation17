import { rect } from './draw'
import type { Ctx } from './draw'

export const PILGRIM_EXTERIOR_SIZE = { width: 480, height: 270 } as const
export const PILGRIM_EXTERIOR_LAYOUT = {
  safeExtent: { left: 30, top: 62, right: 448, bottom: 211 },
  shield: { left: 35, top: 100, right: 114, bottom: 173 },
  foreDrum: { left: 119, top: 70, right: 225, bottom: 204, cx: 172, cy: 137, rx: 53, ry: 67 },
  spineGap: { left: 225, right: 258, y: 136 },
  aftDrum: { left: 258, top: 74, right: 363, bottom: 206, cx: 310, cy: 140, rx: 52, ry: 66 },
  aftService: { left: 365, top: 104, right: 444, bottom: 180 }
} as const

export const PILGRIM_EXTERIOR_PALETTE = {
  space: '#070620', shadow: '#0a0812', deep: '#120d1c', hull: '#17121f', hullMid: '#2a2540',
  seam: '#3a3358', edge: '#463e6b', rim: '#6a6296', rimLight: '#8a82b8', warm: '#ffb347', warmLight: '#ffd08a',
  cool: '#a9c4ff', star: '#efe6d2'
} as const

type Drum = 'fore' | 'aft'

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [22, 50, .45], [73, 31, .32], [101, 225, .35], [147, 45, .28], [191, 225, .4], [235, 36, .3],
  [267, 232, .42], [296, 48, .28], [347, 35, .36], [390, 222, .32], [452, 42, .35], [463, 229, .28],
  [52, 202, .3], [88, 75, .24], [209, 55, .3], [247, 210, .28], [379, 58, .26], [425, 72, .34]
]

function ellipseFill(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))))
    rect(ctx, cx - half, cy + dy, half * 2 + 1, 1, color)
  }
}

function ellipseRim(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, thickness = 1) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))))
    rect(ctx, cx - half, cy + dy, thickness, 1, color)
    rect(ctx, cx + half - thickness + 1, cy + dy, thickness, 1, color)
  }
  for (const dx of [-rx, rx]) {
    for (let step = 0; step < thickness; step++) {
      rect(ctx, cx + dx, cy - ry + step, 1, 1, color)
      rect(ctx, cx + dx, cy + ry - step, 1, 1, color)
    }
  }
}

function drawBackground(ctx: Ctx) {
  rect(ctx, 0, 0, 480, 270, PILGRIM_EXTERIOR_PALETTE.space)
  for (const [x, y, alpha] of STARS) rect(ctx, x, y, 1, 1, PILGRIM_EXTERIOR_PALETTE.star, alpha)
  rect(ctx, 0, 0, 480, 2, PILGRIM_EXTERIOR_PALETTE.shadow, .72)
  rect(ctx, 0, 268, 480, 2, PILGRIM_EXTERIOR_PALETTE.shadow, .72)
}

function drawSpine(ctx: Ctx) {
  const p = PILGRIM_EXTERIOR_PALETTE
  // The thin, uninterrupted non-rotating backbone is clearest in the negative gap.
  rect(ctx, 76, 133, 355, 7, p.shadow)
  rect(ctx, 80, 134, 347, 4, p.seam)
  rect(ctx, 80, 134, 347, 1, p.rim)
  rect(ctx, 91, 130, 19, 12, p.hullMid)
  rect(ctx, 99, 129, 5, 14, p.edge)
  rect(ctx, 220, 131, 44, 11, p.hull)
  rect(ctx, 225, 133, 33, 7, p.rim)
  rect(ctx, 229, 135, 25, 3, p.shadow)
  rect(ctx, 265, 131, 13, 12, p.hullMid)
  rect(ctx, 270, 129, 4, 15, p.edge)
  rect(ctx, 410, 132, 24, 10, p.hull)
  rect(ctx, 416, 134, 12, 4, p.rim)
}

function drawShield(ctx: Ctx) {
  const p = PILGRIM_EXTERIOR_PALETTE
  for (let dy = -36; dy <= 36; dy += 1) {
    const inset = Math.floor(Math.abs(dy) * .26)
    const x = 35 + inset
    const right = 114 - Math.floor(Math.abs(dy) * .1)
    rect(ctx, x, 137 + dy, right - x, 1, p.hull)
  }
  for (let dy = -29; dy <= 29; dy += 1) {
    const inset = Math.floor(Math.abs(dy) * .24)
    const x = 42 + inset
    const right = 109 - Math.floor(Math.abs(dy) * .08)
    rect(ctx, x, 137 + dy, right - x, 1, p.hullMid)
  }
  rect(ctx, 40, 119, 64, 2, p.rim)
  rect(ctx, 40, 119, 47, 1, p.rimLight)
  rect(ctx, 47, 137, 62, 3, p.deep)
  rect(ctx, 47, 138, 59, 1, p.edge)
  rect(ctx, 45, 154, 60, 2, p.rim)
  rect(ctx, 47, 155, 45, 1, p.rimLight)
  rect(ctx, 51, 110, 2, 53, p.hullMid)
  rect(ctx, 52, 113, 1, 46, p.edge)
  rect(ctx, 70, 108, 2, 58, p.hull)
  rect(ctx, 71, 111, 1, 52, p.rim)
  rect(ctx, 108, 124, 12, 25, p.hull)
  rect(ctx, 111, 128, 11, 17, p.edge)
}

function drawDrum(ctx: Ctx, drum: Drum) {
  const p = PILGRIM_EXTERIOR_PALETTE
  const shape = drum === 'fore' ? PILGRIM_EXTERIOR_LAYOUT.foreDrum : PILGRIM_EXTERIOR_LAYOUT.aftDrum
  const { cx, cy, rx, ry } = shape
  ellipseFill(ctx, cx, cy + 4, rx, ry, p.shadow)
  ellipseFill(ctx, cx, cy, rx, ry, p.hullMid)
  // Broad shielded side panels make each habitat read as a durable inhabited volume.
  for (let dy = -ry + 8; dy <= ry - 8; dy++) {
    const half = Math.floor((rx - 7) * Math.sqrt(Math.max(0, 1 - dy * dy / ((ry - 8) * (ry - 8)))))
    rect(ctx, cx - half, cy + dy, half * 2 + 1, 1, Math.abs(dy) < ry * .55 ? p.hullMid : p.hull)
  }
  ellipseRim(ctx, cx, cy, rx, ry, p.edge, 2)
  ellipseRim(ctx, cx, cy, rx - 5, ry - 5, p.rim, 1)
  ellipseRim(ctx, cx, cy - 2, rx - 10, ry - 10, p.seam, 1)
  // Longitudinal ribs reinforce the nearly side-on 3/4 composition.
  const ribs = drum === 'fore' ? [143, 158, 188, 202] : [281, 296, 326, 340]
  for (const x of ribs) {
    const d = Math.abs(x - cx)
    const half = Math.floor((ry - 17) * Math.sqrt(Math.max(0, 1 - d * d / (rx * rx))))
    if (half > 0) {
      rect(ctx, x, cy - half, 2, half * 2, p.seam)
      rect(ctx, x, cy - half + 4, 1, half * 2 - 8, p.rim, .7)
    }
  }
  // Covered amber service slits hint at long habitation without adding exposed windows.
  const lights = drum === 'fore' ? [[166, 116], [181, 153], [196, 127]] : [[303, 119], [319, 156], [335, 130]]
  for (const [x, y] of lights) {
    rect(ctx, x - 2, y - 2, 8, 5, p.hull)
    rect(ctx, x, y, 4, 1, p.warm, .68)
    rect(ctx, x, y - 1, 2, 1, p.warmLight, .42)
  }
  rect(ctx, cx - 14, cy - ry + 11, 28, 2, p.rimLight, .46)
  rect(ctx, cx - 22, cy + ry - 12, 44, 2, p.deep)
}

function drawAftService(ctx: Ctx, time: number, motion: boolean) {
  const p = PILGRIM_EXTERIOR_PALETTE
  const { left, top, right, bottom } = PILGRIM_EXTERIOR_LAYOUT.aftService
  // Enclosed service core; the spars and radiators suggest maintenance, not weapons or thrust.
  rect(ctx, left + 10, 122, 39, 29, p.hull)
  rect(ctx, left + 13, 125, 34, 23, p.hullMid)
  rect(ctx, left + 13, 125, 34, 2, p.edge)
  rect(ctx, left + 45, 127, 4, 19, p.rim)
  rect(ctx, right - 11, 111, 8, 49, p.hull)
  for (let y = 113; y < 159; y += 5) rect(ctx, right - 10, y, 9, 2, p.rim)
  rect(ctx, right - 13, 107, 3, 57, p.seam)
  rect(ctx, left + 4, 116, 5, 39, p.rim)
  rect(ctx, left + 4, 116, 1, 39, p.rimLight, .6)
  rect(ctx, left + 1, 120, 3, 31, p.hull)
  rect(ctx, left + 3, 102, 2, 18, p.seam)
  rect(ctx, left + 4, 100, 2, 3, p.rim)
  rect(ctx, left + 3, 155, 2, 19, p.seam)
  rect(ctx, left + 4, 173, 2, 3, p.rim)
  // Open service trusses remain short and secondary to the four major silhouette anchors.
  rect(ctx, left + 17, top + 4, 2, 19, p.edge)
  rect(ctx, left + 18, top + 4, 18, 2, p.seam)
  rect(ctx, left + 20, top + 6, 2, 12, p.rim)
  rect(ctx, left + 22, bottom - 10, 2, 16, p.edge)
  rect(ctx, left + 24, bottom - 10, 16, 2, p.seam)
  rect(ctx, left + 37, bottom - 12, 2, 10, p.rim)
  const glow = motion ? .68 + .06 * Math.sin(2 * Math.PI * time / 6) : .68
  rect(ctx, left + 25, 133, 4, 3, p.deep)
  rect(ctx, left + 26, 134, 2, 1, p.warm, glow)
  rect(ctx, left + 25, 129, 5, 1, p.warmLight, .3)
  rect(ctx, right - 2, 124, 2, 25, p.hull)
}

/** Opposed decorative rim markers; the period is an on-screen art rhythm, not a vessel speed. */
export function rimMarkerPosition(drum: Drum, seconds: number) {
  const shape = drum === 'fore' ? PILGRIM_EXTERIOR_LAYOUT.foreDrum : PILGRIM_EXTERIOR_LAYOUT.aftDrum
  const direction = drum === 'fore' ? 1 : -1
  const angle = -Math.PI / 2 + direction * 2 * Math.PI * seconds / 8
  return {
    x: Math.round(shape.cx + (shape.rx - 2) * Math.cos(angle)),
    y: Math.round(shape.cy + (shape.ry - 2) * Math.sin(angle))
  }
}

/** One deterministic frame of the proposed exterior. It consumes no game model, clock, or RNG. */
export function drawPilgrimExterior(ctx: Ctx, seconds = 0, motion = true) {
  const time = Number.isFinite(seconds) ? seconds : 0
  const p = PILGRIM_EXTERIOR_PALETTE
  drawBackground(ctx)
  drawSpine(ctx)
  drawShield(ctx)
  drawDrum(ctx, 'fore')
  drawDrum(ctx, 'aft')
  drawAftService(ctx, time, motion)
  for (const drum of ['fore', 'aft'] as const) {
    const point = rimMarkerPosition(drum, motion ? time : 0)
    rect(ctx, point.x - 2, point.y - 2, 5, 5, p.hull)
    rect(ctx, point.x - 1, point.y - 1, 3, 3, drum === 'fore' ? p.warm : p.cool)
    rect(ctx, point.x, point.y, 1, 1, drum === 'fore' ? p.warmLight : p.rimLight)
  }
}
