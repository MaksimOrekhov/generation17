import { hash32, seeded } from '../domain/random'
import { line, rect } from './draw'
import type { Ctx } from './draw'

const SKINS = ['#f2c9a0', '#e0a979', '#c98b5c', '#a56a43', '#7c4a2d']
const HAIRS = ['#2a1d14', '#4a2f1a', '#8a5a2b', '#c9a15a', '#7b2c2c', '#1d2a3a', '#3b2a4a']
const SHIRTS = ['#4a6fa5', '#7a9e4f', '#b0563f', '#8a6bb0', '#c9a43a', '#3f8f86', '#a85a7a']
const PANTS = ['#2f3f5a', '#3a3358', '#4a3a2c', '#2f4a48', '#3b3b4a']
const BACKGROUNDS = ['#3a2f55', '#2f3f5a', '#4a3350', '#2f4a48', '#4a3a2c']
const GREY = '#b9b4c4'

export interface Look {
  skin: string
  hair: string
  shirt: string
  pants: string
  bg: string
  style: 'short' | 'long' | 'bun' | 'crop'
}

/** Внешний вид человека по имени: один и тот же в портрете и на сцене. */
export function look(name: string, age: number): Look {
  const r = seeded(hash32('look', name))
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]!
  const styles = ['short', 'long', 'bun', 'crop'] as const
  const hair = age >= 62 ? GREY : age >= 48 && r() < .4 ? '#8c8798' : pick(HAIRS)
  return { skin: pick(SKINS), hair, shirt: pick(SHIRTS), pants: pick(PANTS), bg: pick(BACKGROUNDS), style: pick(styles) }
}

/** Младенец до трёх лет: крупная голова, широко расставленные глаза, пара волосков, нагрудник. */
function drawBaby(ctx: Ctx, w: number, name: string, age: number) {
  const l = look(name, age)
  const u = w / 40
  const R = (x: number, y: number, ww: number, hh: number, c: string, a = 1) => rect(ctx, x * u, y * u, Math.max(1, ww * u), Math.max(1, hh * u), c, a)
  rect(ctx, 0, 0, w, w * 1.2, l.bg)
  R(0, 0, 40, 3, '#ffffff', .05)
  R(9, 38, 22, 10, l.shirt)
  R(13, 38, 14, 10, '#f4ead4')                       // нагрудник
  R(13, 38, 14, 1, '#000000', .12)
  R(16, 42, 8, 2, l.shirt, .5)
  R(10, 12, 20, 24, l.skin)                          // голова
  R(12, 11, 16, 1, l.skin); R(12, 36, 16, 1, l.skin)
  R(10, 32, 20, 4, '#000000', .07)
  R(8, 21, 2, 5, l.skin); R(30, 21, 2, 5, l.skin)    // уши
  R(16, 9, 8, 3, l.hair); R(18, 8, 4, 1, l.hair)     // хохолок
  R(14, 12, 5, 1, l.hair, .6)
  R(12, 22, 6, 6, '#f8f5ee'); R(22, 22, 6, 6, '#f8f5ee')  // глаза
  R(14, 23, 4, 5, '#2a1f38'); R(24, 23, 4, 5, '#2a1f38')
  R(14, 23, 2, 2, '#ffffff'); R(24, 23, 2, 2, '#ffffff')
  R(19, 29, 2, 1, '#000000', .18)
  R(18, 32, 4, 1, '#8a3f34'); R(19, 33, 2, 1, '#8a3f34', .6)
  R(11, 29, 4, 2, '#ff8a7a', .35); R(25, 29, 4, 2, '#ff8a7a', .35)
}

/** Портрет «анфас» в логическом разрешении 40×48. */
export function drawPortrait(ctx: Ctx, w: number, h: number, name: string, age: number) {
  if (age < 3) {
    drawBaby(ctx, w, name, age)
    return
  }
  const l = look(name, age)
  const u = w / 40
  const child = age < 13
  const R = (x: number, y: number, ww: number, hh: number, c: string, a = 1) => rect(ctx, x * u, y * u, Math.max(1, ww * u), Math.max(1, hh * u), c, a)

  rect(ctx, 0, 0, w, h, l.bg)
  R(0, 0, 40, 3, '#ffffff', .05)

  // плечи и воротник
  R(5, 38, 30, 10, l.shirt)
  R(5, 38, 30, 1, '#000000', .2)
  R(16, 36, 8, 4, l.skin)
  R(16, 36, 8, 1, '#000000', .25)
  R(28, 41, 5, 3, '#ffb347')

  // волосы за головой
  if (l.style === 'long') R(8, 12, 24, 28, l.hair)
  if (l.style === 'bun') { R(16, 3, 8, 6, l.hair); R(17, 2, 6, 2, l.hair) }

  // голова
  const top = child ? 11 : 9
  R(11, top + 2, 18, 24 - (child ? 2 : 0), l.skin)
  R(12, top + 1, 16, 1, l.skin)
  R(11, top + 24 - (child ? 2 : 0), 18, 2, l.skin)
  R(11, top + 22, 18, 3, '#000000', .08)
  R(9, 20, 2, 5, l.skin); R(29, 20, 2, 5, l.skin)             // уши
  R(9, 21, 1, 3, '#000000', .12); R(30, 21, 1, 3, '#000000', .12)

  // причёска
  R(10, top - 1, 20, 6, l.hair)
  R(9, top + 1, 3, 9, l.hair); R(28, top + 1, 3, 9, l.hair)
  if (l.style === 'crop') R(10, top - 1, 20, 4, l.hair)
  else if (l.style === 'short') { R(13, top + 3, 10, 3, l.hair); R(10, top + 4, 4, 3, l.hair) }
  else R(12, top + 3, 16, 3, l.hair)
  R(12, top - 1, 8, 1, '#ffffff', .12)

  // глаза и брови
  const ey = child ? 21 : 20
  const eyeH = child ? 4 : 3
  R(14, ey, 4, eyeH, '#f8f5ee'); R(22, ey, 4, eyeH, '#f8f5ee')
  R(15, ey, 3, eyeH, '#2a1f38'); R(23, ey, 3, eyeH, '#2a1f38')
  R(15, ey, 1, 1, '#ffffff'); R(23, ey, 1, 1, '#ffffff')
  R(13, ey - 3, 5, 1, l.hair); R(22, ey - 3, 5, 1, l.hair)

  // нос и рот
  R(19, 25, 2, 3, '#000000', .16)
  R(17, 30, 6, 1, '#8a3f34'); R(18, 31, 4, 1, '#8a3f34', .6)
  const blush = child ? [3, 2, .3] as const : [3, 1, .15] as const
  R(12, 27, blush[0], blush[1], '#ff8a7a', blush[2]); R(25, 27, blush[0], blush[1], '#ff8a7a', blush[2])

  // морщины
  if (age >= 55) { R(13, 18, 5, 1, '#000000', .2); R(22, 18, 5, 1, '#000000', .2); R(16, 29, 1, 2, '#000000', .15); R(23, 29, 1, 2, '#000000', .15) }
  if (age >= 38 && age < 55) R(15, 18, 10, 1, '#000000', .1)
}

export interface Point { x: number; y: number }

export interface PersonSprite {
  look: Look
  /** Рост в пикселях сцены. */
  height: number
  /** Центр стоп по x и линия пола по y. */
  x: number
  feet: number
  bob?: number
  /** Правая (экранная) рука тянется к этой точке — например, ребёнок держит родителя за руку. */
  reach?: Point
}

/** Человек со спины, подсвеченный лампой справа. Пропорции зависят от роста. */
export interface PersonAnchors { handL: Point; handR: Point; torsoTop: number; shoulderLeft: number; shoulderRight: number; headTop: number }

export function drawBackPerson(ctx: Ctx, p: PersonSprite): PersonAnchors {
  const { look: l, height: h } = p
  const bob = p.bob ?? 0
  const headH = Math.round(h * .2)
  const headW = Math.round(h * .19)
  const legH = Math.round(h * .42)
  const shoulder = Math.round(h * .3)
  const torsoH = h - headH - legH - 2
  const x = Math.round(p.x)
  const legsTop = p.feet - legH
  const torsoTop = legsTop - torsoH + bob
  const headTop = torsoTop - 2 - headH

  // тень на полу
  rect(ctx, x - shoulder / 2 - 4, p.feet - 1, shoulder + 12, 3, '#000000', .28)
  rect(ctx, x - shoulder / 2 - 1, p.feet + 1, shoulder + 6, 2, '#000000', .2)

  // ноги и обувь
  const lw = Math.floor(shoulder / 2) - 1
  rect(ctx, x - lw - 1, legsTop, lw, legH, l.pants)
  rect(ctx, x + 1, legsTop, lw, legH, l.pants)
  rect(ctx, x - lw - 1, legsTop, 1, legH, '#000000', .25)
  rect(ctx, x + lw, legsTop, 1, legH, '#ffb347', .35)
  rect(ctx, x - lw - 2, p.feet - 2, lw + 2, 3, '#17121f')
  rect(ctx, x + 1, p.feet - 2, lw + 2, 3, '#17121f')

  // торс и руки
  const sx = x - Math.floor(shoulder / 2)
  rect(ctx, sx, torsoTop, shoulder, torsoH, l.shirt)
  rect(ctx, sx + 1, torsoTop - 1, shoulder - 2, 1, l.shirt)
  rect(ctx, sx, torsoTop, shoulder, 1, '#ffffff', .15)
  rect(ctx, sx, torsoTop, 2, torsoH, '#000000', .22)
  rect(ctx, x, torsoTop + 2, 1, torsoH - 3, '#000000', .12)
  rect(ctx, sx + shoulder - 2, torsoTop, 2, torsoH, '#ffb347', .3)
  const armW = Math.max(3, Math.round(h * .055))
  const armH = Math.round(torsoH * .78)
  rect(ctx, sx - armW, torsoTop + 1, armW, armH, l.shirt)
  rect(ctx, sx - armW, torsoTop + 1, 1, armH, '#000000', .25)
  rect(ctx, sx - armW, torsoTop + 1 + armH, armW, armW, l.skin)
  if (p.reach) {
    // рука поднята к чужой руке: плечо → кисть
    line(ctx, sx + shoulder + 1, torsoTop + 3, p.reach.x, p.reach.y - 1, l.shirt, armW - 1)
    rect(ctx, p.reach.x - 1, p.reach.y - 1, armW, armW, l.skin)
  } else {
    rect(ctx, sx + shoulder, torsoTop + 1, armW, armH, l.shirt)
    rect(ctx, sx + shoulder + armW - 1, torsoTop + 1, 1, armH, '#ffb347', .3)
    rect(ctx, sx + shoulder, torsoTop + 1 + armH, armW, armW, l.skin)
  }

  // шея и голова (волосы закрывают затылок)
  rect(ctx, x - 2, torsoTop - 2, 4, 3, l.skin)
  const hx = x - Math.floor(headW / 2)
  rect(ctx, hx, headTop + 1, headW, headH - 1, l.hair)
  rect(ctx, hx + 1, headTop, headW - 2, 1, l.hair)
  rect(ctx, hx + 1, headTop + 1, headW - 2, 1, '#ffffff', .14)
  rect(ctx, hx - 1, headTop + Math.round(headH * .45), 1, 3, l.skin)
  rect(ctx, hx + headW, headTop + Math.round(headH * .45), 1, 3, l.skin)
  rect(ctx, hx, headTop + 1, 2, headH - 2, '#000000', .2)
  rect(ctx, hx + headW - 2, headTop + 1, 2, headH - 2, '#ffb347', .3)
  if (l.style === 'long') {
    rect(ctx, hx - 1, headTop + headH - 2, headW + 2, Math.round(headH * .9), l.hair)
    rect(ctx, hx - 1, headTop + headH - 2, 2, Math.round(headH * .9), '#000000', .2)
  }
  if (l.style === 'bun') {
    rect(ctx, x - 2, headTop - 3, 5, 4, l.hair)
    rect(ctx, x + 1, headTop - 3, 2, 3, '#ffb347', .3)
  }
  const handY = torsoTop + 1 + armH + Math.floor(armW / 2)
  return {
    handL: { x: sx - Math.ceil(armW / 2), y: handY },
    handR: { x: sx + shoulder + Math.floor(armW / 2), y: handY },
    torsoTop, headTop, shoulderLeft: sx, shoulderRight: sx + shoulder
  }
}
