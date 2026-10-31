import type { SectorId } from '../domain/types'
import { line, rect } from './draw'
import type { Ctx } from './draw'

const WALLS: Record<SectorId, string> = {
  atrium: '#201d36', bio: '#1a2824', engineering: '#262029', clinic: '#1b2832', lower: '#221b28'
}
const PALETTE = {
  ceiling: '#120f1d', floor: '#17121f', panel: '#2a2540', seam: '#3a3358', steel: '#6a6296', steelHi: '#8a82b8',
  warm: '#ffe3b0', green: '#5e9a70', greenHi: '#9ac77e', glass: '#10103a', aqua: '#91c5cf'
} as const

function background(ctx: Ctx, sector: SectorId) {
  const wall = WALLS[sector]
  rect(ctx, 0, 0, 480, 270, wall)
  rect(ctx, 0, 0, 480, 24, PALETTE.ceiling)
  rect(ctx, 0, 22, 480, 3, PALETTE.seam)
  rect(ctx, 0, 210, 480, 60, PALETTE.floor)
  rect(ctx, 0, 208, 480, 3, PALETTE.seam)
  rect(ctx, 0, 214, 480, 1, '#4a4370')
  for (let x = 32; x < 480; x += 64) {
    rect(ctx, x, 27, 2, 178, '#17121f')
    rect(ctx, x + 2, 27, 1, 178, '#4a4370', .5)
    rect(ctx, x - 1, 64, 5, 4, PALETTE.seam)
    rect(ctx, x, 64, 2, 2, PALETTE.steelHi)
  }
  rect(ctx, 18, 30, 154, 7, PALETTE.panel)
  rect(ctx, 20, 31, 148, 2, PALETTE.steel, .6)
}

function window(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rect(ctx, x - 4, y - 4, w + 8, h + 8, '#0a0812')
  rect(ctx, x - 2, y - 2, w + 4, h + 4, PALETTE.steel)
  rect(ctx, x, y, w, h, PALETTE.glass)
  rect(ctx, x + 3, y + 4, Math.max(2, Math.floor(w * .38)), 2, PALETTE.aqua, .55)
  rect(ctx, x + 3, y + 10, 2, Math.max(2, h - 18), PALETTE.steel, .45)
}

function plant(ctx: Ctx, x: number, floor: number, scale = 1) {
  const potW = 12 * scale
  rect(ctx, x, floor - 10 * scale, potW, 10 * scale, '#6c493b')
  rect(ctx, x + 2 * scale, floor - 12 * scale, potW - 4 * scale, 2 * scale, '#b17a4b')
  rect(ctx, x + 5 * scale, floor - 25 * scale, 2 * scale, 14 * scale, PALETTE.green)
  rect(ctx, x + 1 * scale, floor - 22 * scale, 5 * scale, 4 * scale, PALETTE.greenHi)
  rect(ctx, x + 6 * scale, floor - 29 * scale, 6 * scale, 4 * scale, PALETTE.green)
}

function drawAtrium(ctx: Ctx, seconds: number, motion: boolean) {
  window(ctx, 48, 77, 122, 84)
  window(ctx, 183, 77, 122, 84)
  window(ctx, 318, 77, 112, 84)
  rect(ctx, 48, 169, 382, 4, '#4a4370')
  for (const x of [55, 84, 141, 190, 223, 274, 324, 354, 412]) plant(ctx, x, 205, x % 2 ? 1 : 2)
  rect(ctx, 70, 201, 342, 3, PALETTE.steel)
  rect(ctx, 70, 201, 342, 1, PALETTE.steelHi, .45)
  rect(ctx, 392, 42, 42, 3, PALETTE.warm, motion ? .58 + .1 * Math.sin(seconds) : .58)
}

function drawBio(ctx: Ctx, seconds: number, motion: boolean) {
  // Repeated greenhouse arches are illustrative motifs, not a passage or floorplan.
  for (const x of [55, 180, 305]) {
    line(ctx, x, 162, x, 95, PALETTE.green, 3)
    line(ctx, x, 95, x + 42, 55, PALETTE.green, 3)
    line(ctx, x + 42, 55, x + 84, 95, PALETTE.green, 3)
    line(ctx, x + 84, 95, x + 84, 162, PALETTE.green, 3)
    rect(ctx, x + 4, 160, 76, 3, PALETTE.aqua, .46)
    for (let i = 0; i < 4; i++) {
      const sx = x + 10 + i * 18
      rect(ctx, sx, 176, 13, 8, '#453c31')
      plant(ctx, sx + 3, 175, 1)
    }
  }
  rect(ctx, 30, 191, 402, 5, '#2e5544')
  rect(ctx, 83, 42, 38, 3, PALETTE.warm, motion ? .6 + .12 * Math.sin(seconds * .7) : .6)
}

function drawEngineering(ctx: Ctx, seconds: number, motion: boolean) {
  // Repair frame, pump housings and pipe runs suggest a work area without a navigable plan.
  rect(ctx, 70, 71, 174, 9, '#383247')
  rect(ctx, 76, 80, 8, 94, PALETTE.steel)
  rect(ctx, 231, 80, 8, 94, PALETTE.steel)
  rect(ctx, 83, 88, 148, 5, PALETTE.steelHi, .65)
  rect(ctx, 104, 101, 116, 6, '#17121f')
  rect(ctx, 111, 103, 90, 2, PALETTE.warm, motion ? .48 + .12 * Math.sin(seconds) : .48)
  for (const [x, w] of [[44, 40], [268, 54], [353, 70]] as const) {
    rect(ctx, x, 137, w, 49, '#302b3a')
    rect(ctx, x + 5, 130, w - 10, 8, PALETTE.steel)
    rect(ctx, x + 7, 144, w - 14, 3, PALETTE.aqua, .48)
    rect(ctx, x + 7, 160, w - 14, 2, PALETTE.seam)
    rect(ctx, x + 9, 174, 8, 3, PALETTE.warm)
  }
  line(ctx, 28, 120, 450, 120, PALETTE.steel, 3)
  line(ctx, 28, 124, 450, 124, '#17121f', 2)
  for (const x of [94, 249, 337, 427]) rect(ctx, x, 113, 7, 15, PALETTE.steel)
  rect(ctx, 410, 52, 35, 3, PALETTE.warm, motion ? .56 + .08 * Math.sin(seconds * .8) : .56)
}

function drawClinic(ctx: Ctx, seconds: number, motion: boolean) {
  // A quiet waiting corridor with reception and lab glass; these are types, not named rooms.
  rect(ctx, 30, 56, 420, 118, '#26313a')
  rect(ctx, 30, 56, 420, 3, '#a3a8b7')
  rect(ctx, 30, 170, 420, 4, '#778196')
  for (const x of [57, 163, 269, 375]) {
    rect(ctx, x, 78, 78, 68, '#1b2832')
    rect(ctx, x - 2, 75, 82, 4, '#9ca0ae')
    rect(ctx, x + 7, 86, 64, 2, '#d3ced0', .7)
    rect(ctx, x + 10, 102, 3, 35, '#7e8b9c')
  }
  rect(ctx, 54, 184, 171, 15, '#b7b2b6')
  rect(ctx, 54, 181, 171, 4, '#e2ded6')
  rect(ctx, 240, 184, 185, 15, '#777d8d')
  rect(ctx, 249, 178, 52, 5, PALETTE.aqua)
  rect(ctx, 312, 175, 34, 8, '#d3ced0')
  rect(ctx, 362, 179, 42, 4, PALETTE.warm, motion ? .55 + .08 * Math.sin(seconds * .75) : .55)
}

function drawLower(ctx: Ctx, seconds: number, motion: boolean) {
  // Lower ceiling, communal tables and laundry drums give the sector a distinct low profile.
  rect(ctx, 0, 40, 480, 16, '#100d18')
  for (let x = 22; x < 480; x += 44) {
    rect(ctx, x, 43, 26, 9, '#342d3b')
    rect(ctx, x + 3, 45, 2, 5, PALETTE.steel)
  }
  rect(ctx, 52, 103, 174, 10, '#705448')
  rect(ctx, 65, 113, 7, 48, '#49372f')
  rect(ctx, 203, 113, 7, 48, '#49372f')
  rect(ctx, 270, 115, 178, 8, '#705448')
  rect(ctx, 281, 123, 7, 42, '#49372f')
  rect(ctx, 430, 123, 7, 42, '#49372f')
  for (const x of [80, 119, 158, 300, 339, 378]) {
    rect(ctx, x, 91, 23, 12, '#514b5c')
    rect(ctx, x + 3, 94, 17, 2, PALETTE.warm, .56)
  }
  for (const x of [66, 109, 152]) {
    rect(ctx, x, 170, 32, 31, '#3e394b')
    rect(ctx, x + 5, 175, 22, 20, '#1b1a2a')
    rect(ctx, x + 7, 178, 18, 2, PALETTE.aqua, motion ? .48 + .08 * Math.sin(seconds + x) : .48)
  }
  line(ctx, 32, 73, 450, 73, PALETTE.steel, 2)
}

/** Pure, schematic sector illustration. It never encodes coordinates, routes or real room adjacency. */
export function drawShipAtlasSector(ctx: Ctx, sector: SectorId, seconds = 0, motion = true) {
  const t = Number.isFinite(seconds) ? seconds : 0
  background(ctx, sector)
  if (sector === 'atrium') drawAtrium(ctx, t, motion)
  else if (sector === 'bio') drawBio(ctx, t, motion)
  else if (sector === 'engineering') drawEngineering(ctx, t, motion)
  else if (sector === 'clinic') drawClinic(ctx, t, motion)
  else drawLower(ctx, t, motion)
  rect(ctx, 0, 0, 480, 1, PALETTE.steel, .72)
}
