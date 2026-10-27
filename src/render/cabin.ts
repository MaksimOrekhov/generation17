import type { SectorId, SpotId } from '../domain/types'
import { hash32, seeded } from '../domain/random'
import { disc, line, makeLayer, mix, rect } from './draw'
import type { Ctx } from './draw'
import { drawBackPerson, look } from './people'
import type { Look, PersonAnchors } from './people'
import type { SceneModel, SceneRenderer } from './scene'

const W = 480
const H = 270
const FLOOR = 210
const WIN = { x: 250, y: 95, r: 55 }
const LAMP = { x: 378, y: 160 }

const WALLS: Record<SectorId, string> = {
  atrium: '#201d36', bio: '#1a2824', engineering: '#262029', clinic: '#1b2832', lower: '#221b28'
}
const TINTS = [
  { c: '#4a6ab0', a: .1 }, { c: '#5fb070', a: .06 }, { c: '#ffb347', a: .09 }, { c: '#c4602a', a: .1 }
]

/** Подсвечиваемые области для моментов. Для окна — круг, для остальных — прямоугольник. */
const SPOTS: Record<SpotId, { x: number; y: number; w: number; h: number } | { cx: number; cy: number; r: number }> = {
  window: { cx: WIN.x, cy: WIN.y, r: WIN.r + 9 },
  door: { x: 131, y: 106, w: 54, h: 108 },
  terminal: { x: 340, y: 70, w: 110, h: 68 },
  table: { x: 322, y: 146, w: 138, h: 92 },
  plant: { x: 446, y: 140, w: 32, h: 76 },
  parent: { x: 196, y: 120, w: 108, h: 100 }
}

const staticCache = new Map<string, HTMLCanvasElement>()
let glowSprite: HTMLCanvasElement | null = null
const stars = (() => {
  const r = seeded(4242)
  return Array.from({ length: 90 }, () => ({ x: r() * 120, y: r() * 110, p: r() * 6.28, big: r() < .12, hue: r() < .2 ? '#ffd9a0' : r() < .4 ? '#b9d4ff' : '#efe6d2' }))
})()
const dust = (() => {
  const r = seeded(77)
  return Array.from({ length: 22 }, () => ({ x: 300 + r() * 150, y: 100 + r() * 110, v: .2 + r() * .5, p: r() * 6.28 }))
})()

function buildStatic(sector: SectorId, wealth: number): HTMLCanvasElement {
  const { canvas, ctx } = makeLayer(W, H)
  const wall = WALLS[sector]
  const wallLight = mix(wall, '#8a82b8', .12)
  const wallDark = mix(wall, '#000000', .35)
  const rnd = seeded(hash32('cabin', sector, wealth))

  // — стены —
  rect(ctx, 0, 0, W, FLOOR, wall)
  for (let x = 0; x < W; x += 80) {
    rect(ctx, x, 24, 2, FLOOR - 24, wallDark)
    rect(ctx, x + 2, 24, 1, FLOOR - 24, wallLight, .5)
    for (const y of [56, 130]) {
      rect(ctx, x - 1, y, 4, 4, '#4a4370')
      rect(ctx, x - 1, y, 2, 2, '#8a82b8')
    }
  }
  for (let i = 0; i < 40; i++) rect(ctx, rnd() * W, 24 + rnd() * 120, 1 + rnd() * 3, 1, '#000000', .08 + rnd() * .1)
  rect(ctx, 0, 150, W, 60, mix(wall, '#000000', .14))
  rect(ctx, 0, 150, W, 2, '#3a3358')
  rect(ctx, 0, 152, W, 1, '#120d1c')
  for (let x = 20; x < W; x += 40) rect(ctx, x, 158, 1, 50, wallDark, .8)
  rect(ctx, 0, FLOOR - 4, W, 4, '#17121f')
  rect(ctx, 0, FLOOR - 4, W, 1, '#3a3358')

  // — потолок, трубы, вентиляция —
  rect(ctx, 0, 0, W, 22, '#120f1d')
  rect(ctx, 0, 22, W, 2, '#3a3358')
  rect(ctx, 0, 28, 200, 7, '#2a2540')
  rect(ctx, 0, 28, 200, 2, '#4a4370')
  rect(ctx, 0, 33, 200, 2, '#17121f')
  for (const x of [48, 130, 190]) { rect(ctx, x, 26, 6, 11, '#3a3358'); rect(ctx, x, 26, 6, 2, '#6a6296') }
  for (let i = 0; i < 12; i++) {
    rect(ctx, 34 + i * 7, 6, 5, 11, '#2a2540')
    rect(ctx, 34 + i * 7, 6, 1, 11, '#4a4370')
  }
  rect(ctx, 190, 6, 120, 9, '#2d2231')
  rect(ctx, 193, 8, 114, 5, '#ffe3b0', .7)
  rect(ctx, 193, 8, 114, 1, '#ffffff', .5)
  rect(ctx, 330, 8, 130, 4, '#2a2540')

  // — окно —
  const { x: wx, y: wy, r } = WIN
  const noise = (x: number, y: number) => Math.sin(x * .07) + Math.cos(y * .09) + Math.sin((x + y) * .05) + Math.cos((x - y) * .031)
  for (let y = -r - 8; y <= r + 8; y++) {
    for (let x = -r - 8; x <= r + 8; x++) {
      const d2 = x * x + y * y
      if (d2 <= r * r) {
        const n = noise(x + 200, y + 200)
        rect(ctx, wx + x, wy + y, 1, 1, n > 2.3 ? '#241a5e' : n > 1.7 ? '#1a1448' : n > 0.8 ? '#10103a' : '#070620')
      } else if (d2 <= (r + 8) * (r + 8)) {
        const dist = Math.sqrt(d2) - r
        const t = (x + y + 2 * r) / (4 * r)
        const base = mix('#8a82b8', '#2a2540', Math.max(0, Math.min(1, t)))
        const edge = dist < 1 ? '#0a0812' : dist > 7 ? '#17121f' : dist < 2 ? mix(base, '#ffffff', .25) : base
        rect(ctx, wx + x, wy + y, 1, 1, edge)
      }
    }
  }
  for (let a = 0; a < 8; a++) {
    const ang = a * Math.PI / 4 + Math.PI / 8
    const bx = wx + Math.cos(ang) * (r + 4)
    const by = wy + Math.sin(ang) * (r + 4)
    disc(ctx, bx, by, 2, '#4a4370')
    rect(ctx, bx - 1, by - 1, 1, 1, '#c4bde8')
  }
  for (let i = 0; i < 160; i++) {
    const a = rnd() * 6.28
    const rr = Math.sqrt(rnd()) * (r - 2)
    rect(ctx, wx + Math.cos(a) * rr, wy + Math.sin(a) * rr, 1, 1, '#efe6d2', .18 + rnd() * .22)
  }
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue
      const s = x + y
      if (s > -46 && s < -34) rect(ctx, wx + x, wy + y, 1, 1, '#ffffff', .05)
      if (s > -26 && s < -22) rect(ctx, wx + x, wy + y, 1, 1, '#ffffff', .04)
    }
  }
  rect(ctx, wx - 66, wy + r + 8, 132, 5, '#463e6b')
  rect(ctx, wx - 66, wy + r + 8, 132, 1, '#8a82b8')
  rect(ctx, wx - 66, wy + r + 13, 132, 2, '#120d1c')

  // — пол —
  rect(ctx, 0, FLOOR, W, H - FLOOR, '#2a2236')
  for (let y = FLOOR + 14; y < H; y += 14) rect(ctx, 0, y, W, 1, '#1d1728')
  for (let x = -40; x < W + 40; x += 48) line(ctx, x, FLOOR, x + (x - W / 2) * .35, H, '#1d1728')
  rect(ctx, 0, FLOOR, W, 1, '#4a4370')
  for (let y = FLOOR + 1; y < H; y++) {
    const spread = (y - FLOOR) / (H - FLOOR)
    rect(ctx, wx - 56 - spread * 36, y, 112 + spread * 72, 1, '#a9c4ff', .05 * (1 - spread * .6))
  }

  // — дверь —
  rect(ctx, 133, 108, 50, 104, '#17121f')
  rect(ctx, 136, 112, 44, 98, '#2a2540')
  rect(ctx, 136, 112, 44, 2, '#463e6b')
  rect(ctx, 136, 112, 2, 98, '#463e6b')
  rect(ctx, 178, 112, 2, 98, '#120d1c')
  rect(ctx, 143, 122, 30, 26, '#0b0a1c')
  rect(ctx, 143, 122, 30, 2, '#6a6296')
  rect(ctx, 148, 130, 18, 2, '#ffb347', .3)
  rect(ctx, 148, 136, 12, 2, '#ffb347', .2)
  for (const y of [158, 178, 198]) rect(ctx, 142, y, 32, 1, '#17121f')
  rect(ctx, 168, 168, 4, 12, '#9a91c0')
  rect(ctx, 168, 168, 1, 12, '#d9d2f2')
  rect(ctx, 148, 98, 24, 7, '#3b2f22')
  rect(ctx, 151, 100, 18, 2, '#ffb347')
  rect(ctx, 151, 103, 10, 1, '#ffb347', .6)

  // — плакат «Земля» —
  if (wealth >= 2) {
    rect(ctx, 130, 38, 56, 52, '#0e0b1b')
    rect(ctx, 133, 41, 50, 46, '#1a1736')
    disc(ctx, 158, 62, 15, '#2f6fb8')
    disc(ctx, 154, 58, 7, '#3f8f5a')
    rect(ctx, 160, 66, 8, 5, '#3f8f5a')
    rect(ctx, 148, 52, 6, 2, '#ffffff', .5)
    rect(ctx, 144, 74, 28, 1, '#ffffff', .12)
    rect(ctx, 133, 80, 50, 7, '#0e0b1b')
    for (let i = 0; i < 6; i++) rect(ctx, 137 + i * 7, 83, 5, 1, '#c9b27a', .8)
  }

  // — двухъярусная кровать —
  rect(ctx, 10, 124, 5, 90, '#463e6b')
  rect(ctx, 113, 124, 5, 90, '#463e6b')
  rect(ctx, 10, 124, 1, 90, '#8a82b8')
  rect(ctx, 10, 148, 108, 7, '#5a4630')
  rect(ctx, 10, 148, 108, 1, '#8a6c48')
  rect(ctx, 12, 140, 100, 8, mix('#3f8f86', '#000000', wealth <= 2 ? .25 : 0))
  rect(ctx, 12, 140, 100, 1, '#6fd3c0', .5)
  rect(ctx, 16, 134, 26, 6, '#d9c8a4')
  rect(ctx, 16, 134, 26, 1, '#fff5dc', .6)
  if (wealth <= 2) for (let i = 0; i < 6; i++) rect(ctx, 24 + i * 15, 141, 6, 5, '#7a5a3a')   // заплатки
  rect(ctx, 10, 184, 108, 7, '#5a4630')
  rect(ctx, 10, 184, 108, 1, '#8a6c48')
  rect(ctx, 12, 174, 100, 10, '#b0563f')
  rect(ctx, 12, 174, 100, 1, '#e08a6f', .6)
  rect(ctx, 80, 168, 28, 6, '#d9c8a4')
  rect(ctx, 14, 190, 96, 22, '#000000', .25)
  for (let y = 150; y < 190; y += 4) rect(ctx, 106, y, 5, 1, '#2a2540')

  // — терминал на стене —
  rect(ctx, 340, 70, 112, 68, '#17121f')
  rect(ctx, 343, 73, 106, 62, '#0a0916')
  rect(ctx, 343, 73, 106, 1, '#463e6b')
  rect(ctx, 343, 134, 106, 1, '#463e6b')
  rect(ctx, 343, 73, 1, 62, '#463e6b')
  rect(ctx, 448, 73, 1, 62, '#463e6b')
  rect(ctx, 378, 138, 40, 6, '#2a2540')

  // — стол, лампа, кружка —
  rect(ctx, 322, 190, 138, 8, '#6a5238')
  rect(ctx, 322, 190, 138, 2, '#8a6c48')
  rect(ctx, 322, 198, 138, 6, '#4a3a28')
  rect(ctx, 328, 204, 6, 32, '#4a3a28')
  rect(ctx, 448, 204, 6, 32, '#4a3a28')
  rect(ctx, 328, 232, 6, 3, '#17121f')
  rect(ctx, 448, 232, 6, 3, '#17121f')
  rect(ctx, 322, 236, 138, 3, '#000000', .3)
  rect(ctx, 370, 186, 16, 4, '#2a2540')
  rect(ctx, 377, 168, 3, 18, '#2a2540')
  rect(ctx, 364, 150, 28, 5, '#e8b56e')
  rect(ctx, 362, 155, 32, 10, '#d9953f')
  rect(ctx, 362, 163, 32, 2, '#a8691f')
  rect(ctx, 366, 156, 6, 6, '#f2d9a8', .45)
  rect(ctx, 414, 178, 14, 12, '#d9c8a4')
  rect(ctx, 414, 178, 14, 2, '#fff5dc')
  rect(ctx, 428, 181, 4, 6, '#d9c8a4')
  rect(ctx, 416, 180, 10, 2, '#3a2f22')
  rect(ctx, 336, 184, 26, 6, '#3a3358')
  rect(ctx, 336, 184, 26, 1, '#6a6296')

  // — полка с книгами —
  if (wealth >= 4) {
    rect(ctx, 338, 40, 112, 5, '#6a5238')
    rect(ctx, 338, 40, 112, 1, '#8a6c48')
    const cols = ['#b0563f', '#4a6fa5', '#c9a43a', '#7a9e4f', '#8a6bb0', '#a85a7a']
    for (let i = 0, x = 342; x < 440; i++) {
      const bw = 5 + Math.floor(rnd() * 5)
      const bh = 20 + Math.floor(rnd() * 10)
      rect(ctx, x, 40 - bh, bw, bh, cols[i % cols.length]!)
      rect(ctx, x, 40 - bh, 1, bh, '#ffffff', .2)
      x += bw + 1
    }
  }
  // — трещина на стене у бедных семей —
  if (wealth === 1) {
    line(ctx, 52, 62, 64, 82, '#000000', 1)
    line(ctx, 64, 82, 58, 104, '#000000', 1)
    line(ctx, 64, 82, 78, 94, '#000000', 1)
    rect(ctx, 52, 62, 3, 3, '#4a4370', .4)
  }

  // — ковёр —
  rect(ctx, 196, 238, 112, 22, '#3b2f45')
  rect(ctx, 196, 238, 112, 2, '#52446a')
  rect(ctx, 200, 242, 104, 14, '#2f2538')
  for (let i = 0; i < 9; i++) rect(ctx, 204 + i * 11, 246, 6, 4, i % 2 ? '#c9a43a' : '#b0563f', wealth >= 3 ? .8 : .45)
  rect(ctx, 196, 260, 112, 2, '#000000', .25)

  return canvas
}

function getStatic(sector: SectorId, wealth: number) {
  const key = `${sector}|${wealth}`
  let c = staticCache.get(key)
  if (!c) {
    c = buildStatic(sector, wealth)
    staticCache.set(key, c)
  }
  return c
}

function getGlow() {
  if (glowSprite) return glowSprite
  const { canvas, ctx } = makeLayer(130, 100)
  const g = ctx.createRadialGradient(65, 50, 2, 65, 50, 62)
  g.addColorStop(0, 'rgba(255,190,90,.30)')
  g.addColorStop(.45, 'rgba(255,170,70,.09)')
  g.addColorStop(1, 'rgba(255,170,70,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 130, 100)
  glowSprite = canvas
  return canvas
}

function drawStars(ctx: Ctx, t: number) {
  const { x: wx, y: wy, r } = WIN
  for (const s of stars) {
    const px = ((s.x - t * 1.4) % 120 + 120) % 120 - 60
    const py = s.y - 55
    if (px * px + py * py > (r - 2) * (r - 2)) continue
    const a = .45 + .55 * (.5 + .5 * Math.sin(t * 1.8 + s.p))
    rect(ctx, wx + px, wy + py, s.big ? 2 : 1, s.big ? 2 : 1, s.hue, a)
  }
  // цель полёта
  const gx = wx + 20
  const gy = wy - 20
  const g = .65 + .35 * Math.sin(t * 2.4)
  rect(ctx, gx - 1, gy - 1, 3, 3, '#fff0c9')
  rect(ctx, gx, gy - 5, 1, 11, '#ffb347', g * .9)
  rect(ctx, gx - 5, gy, 11, 1, '#ffb347', g * .9)
  disc(ctx, gx, gy, 4, '#ffb347', .12 * g)
}

function drawTerminal(ctx: Ctx, t: number) {
  const f = Math.floor(t * 2.5)
  for (let i = 0; i < 9; i++) {
    const w = 20 + ((i * 17 + f * (i % 2 ? 3 : 5)) % 62)
    rect(ctx, 350, 80 + i * 5, w, 2, i === 3 ? '#ffb347' : '#6fd3c0', .75)
  }
  rect(ctx, 350, 128, 3 + (f % 3) * 3, 3, '#ffb347')
}

function drawPlant(ctx: Ctx, t: number, season: number) {
  rect(ctx, 454, 186, 22, 28, '#3a2a20')
  rect(ctx, 454, 186, 22, 3, '#5a4630')
  rect(ctx, 456, 211, 18, 3, '#000000', .3)
  const sway = Math.sin(t * 1.2) > .3 ? 1 : 0
  const leaf = season === 3 ? '#b8903a' : season === 0 ? '#3d6a4a' : '#4f9a5a'
  const bright = season === 3 ? '#d6a94a' : '#6fbf7a'
  rect(ctx, 463 + sway, 140, 4, 46, '#3d7a4a')
  rect(ctx, 452 + sway, 150, 12, 5, leaf)
  rect(ctx, 467 + sway, 144, 12, 5, leaf)
  rect(ctx, 456 + sway, 134, 9, 5, bright)
  rect(ctx, 468 + sway, 160, 10, 5, leaf)
  rect(ctx, 450 + sway, 168, 10, 5, leaf)
  if (season === 1 || season === 2) {
    disc(ctx, 458 + sway, 132, 3, season === 1 ? '#f2a0c0' : '#ffd24a')
    disc(ctx, 474 + sway, 142, 3, season === 1 ? '#ffffff' : '#ff9a4a')
  }
}

function drawHighlight(ctx: Ctx, spot: SpotId, t: number) {
  const a = .5 + .5 * Math.sin(t * 6)
  const area = SPOTS[spot]
  const col = '#ffd08a'
  if ('r' in area) {
    for (let k = 0; k < 360; k += 2) {
      const rad = k * Math.PI / 180
      rect(ctx, area.cx + Math.cos(rad) * area.r - 1, area.cy + Math.sin(rad) * area.r - 1, 3, 3, col, .25 + a * .6)
    }
    return
  }
  const { x, y, w, h } = area
  rect(ctx, x, y, w, h, '#ffb347', .04 + a * .06)
  const c = 10
  const t2 = 3
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
    rect(ctx, dx > 0 ? cx : cx - c, cy + (dy > 0 ? 0 : -t2), c, t2, col, .4 + a * .6)
    rect(ctx, cx + (dx > 0 ? 0 : -t2), dy > 0 ? cy : cy - c, t2, c, col, .4 + a * .6)
  }
}

/** Малыш до года на руках у родителя: голова выглядывает из-за плеча, одеяльце на сгибе руки. */
function drawBundle(ctx: Ctx, a: PersonAnchors, skin: string, hair: string) {
  const x = a.shoulderLeft - 9
  const y = a.torsoTop + 1
  rect(ctx, x, y + 6, 15, 17, '#e8d9b8')
  rect(ctx, x, y + 6, 15, 2, '#ffffff', .35)
  rect(ctx, x, y + 14, 15, 2, '#b0563f')
  rect(ctx, x + 14, y + 6, 1, 17, '#ffb347', .3)
  rect(ctx, x + 1, y - 5, 11, 11, skin)
  rect(ctx, x + 1, y - 6, 11, 3, hair)
  rect(ctx, x + 4, y - 8, 4, 2, hair)
  rect(ctx, x + 11, y - 3, 1, 8, '#ffb347', .35)
}

/** Малыш 1–2 лет сидит на ковре рядом с кубиками: стоять он ещё не умеет. */
function drawSitter(ctx: Ctx, t: number, look: Look, x: number, y: number) {
  const nod = Math.sin(t * 1.4) > .6 ? 1 : 0
  rect(ctx, x - 9, y - 1, 20, 3, '#000000', .28)
  rect(ctx, x - 7, y - 12, 15, 12, look.shirt)
  rect(ctx, x - 7, y - 12, 15, 1, '#ffffff', .15)
  rect(ctx, x + 6, y - 12, 2, 12, '#ffb347', .3)
  rect(ctx, x - 9, y - 9, 3, 8, look.shirt)
  rect(ctx, x + 8, y - 9, 3, 8, look.shirt)
  rect(ctx, x - 9, y - 2, 3, 3, look.skin)
  rect(ctx, x + 8, y - 2, 3, 3, look.skin)
  rect(ctx, x - 6, y - 1, 5, 3, look.pants)
  rect(ctx, x + 1, y - 1, 5, 3, look.pants)
  rect(ctx, x - 6, y - 23 + nod, 13, 11, look.hair)
  rect(ctx, x - 7, y - 19 + nod, 1, 3, look.skin)
  rect(ctx, x + 7, y - 19 + nod, 1, 3, look.skin)
  rect(ctx, x + 5, y - 23 + nod, 2, 11, '#ffb347', .3)
  // кубики
  rect(ctx, x + 16, y - 7, 7, 7, '#c9a43a')
  rect(ctx, x + 16, y - 7, 7, 1, '#ffffff', .3)
  rect(ctx, x + 22, y - 14, 6, 6, '#4a6fa5')
  rect(ctx, x + 22, y - 14, 6, 1, '#ffffff', .3)
}

function drawPeople(ctx: Ctx, t: number, m: SceneModel) {
  const bob = Math.sin(t * 1.5) > .88 ? -1 : 0
  const feet = 232
  const me = look(m.name, m.age)
  const c = m.companion
  const cl = c ? look(c.name, c.age) : null
  const parentH = 68

  // младенец до года: родитель держит его на руках
  if (m.age < 1 && c && cl) {
    const a = drawBackPerson(ctx, { look: cl, height: parentH, x: 258, feet, bob })
    drawBundle(ctx, a, me.skin, me.hair)
    return
  }
  // 1–2 года: малыш сидит на ковре
  if (m.age < 3) {
    drawSitter(ctx, t, me, c ? 232 : 250, 252)
    if (c && cl) drawBackPerson(ctx, { look: cl, height: parentH, x: 280, feet, bob })
    return
  }

  // с трёх лет стоит; рост зависит от возраста
  const kid = Math.round(Math.min(64, 30 + (m.age - 3) * 2.7))
  if (!c || !cl) {
    drawBackPerson(ctx, { look: me, height: kid, x: 250, feet, bob })
    return
  }
  const arm = (h: number) => Math.max(3, Math.round(h * .055))
  const half = (h: number) => Math.round(h * .3) / 2 + arm(h)
  const cX = 270
  // ребёнок стоит вплотную к родителю, чтобы дотянуться до руки
  const meX = Math.round(cX - half(parentH) - 4 - half(kid))
  const holds = m.age <= 12 || c.kind === 'partner'
  const parent = drawBackPerson(ctx, { look: cl, height: parentH, x: cX, feet, bob })
  drawBackPerson(ctx, { look: me, height: kid, x: meX, feet, bob: -bob, reach: holds ? parent.handL : undefined })
}

export const cabinScene: SceneRenderer = {
  id: 'cabin',
  draw(ctx, t, m) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(getStatic(m.sectorId, m.wealth), 0, 0)
    drawStars(ctx, t)
    drawTerminal(ctx, t)
    drawPlant(ctx, t, m.season)
    drawPeople(ctx, t, m)

    const flick = .9 + Math.sin(t * 8) * .03 + Math.sin(t * 21) * .015
    ctx.globalAlpha = Math.min(1, flick)
    ctx.drawImage(getGlow(), LAMP.x - 130, LAMP.y - 100, 260, 200)
    ctx.globalAlpha = 1

    for (const p of dust) {
      const x = p.x + Math.cos(t * p.v * .7 + p.p) * 9
      const y = p.y + Math.sin(t * p.v + p.p) * 6
      rect(ctx, x, y, 1, 1, '#ffe3b0', .35 + .35 * Math.sin(t * 2 + p.p))
    }
    if (m.spot) drawHighlight(ctx, m.spot, t)

    const tint = TINTS[m.season]!
    rect(ctx, 0, 0, W, H, tint.c, tint.a)
    // виньетка
    rect(ctx, 0, 0, W, 6, '#000000', .35)
    rect(ctx, 0, H - 8, W, 8, '#000000', .35)
    rect(ctx, 0, 0, 6, H, '#000000', .3)
    rect(ctx, W - 6, 0, 6, H, '#000000', .3)
  }
}
