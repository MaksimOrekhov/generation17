import { line, rect } from './draw'
import type { Ctx } from './draw'

export const PILGRIM_V2_SIZE = { width: 480, height: 270 } as const
export const PILGRIM_V2_LAYOUT = {
  hull: { left: 24, top: 56, right: 456, bottom: 202 },
  ring: { cx: 286, cy: 137, outerRx: 29, outerRy: 69, innerRx: 20, innerRy: 59 },
  bow: { left: 24, right: 145 },
  residentialSpine: { left: 145, right: 374 },
  aftService: { left: 374, right: 456 }
} as const

export const PILGRIM_V2_PALETTE = {
  space: '#070620', star: '#ddd6e8', deep: '#0a0812', shadow: '#100d18', hull: '#302a3a',
  hullMid: '#40384c', hullLight: '#555064', plate: '#70677d', plateLight: '#918aa2', seam: '#211d2a',
  steel: '#716b99', steelLight: '#9b93c0', warm: '#ffb347', warmLight: '#ffd08a', cool: '#a9c4ff'
} as const

type Point = readonly [number, number]

const SKY_POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [19, 47, .32], [45, 218, .22], [73, 70, .3], [94, 34, .38], [119, 227, .24], [146, 47, .27],
  [174, 221, .26], [198, 34, .34], [222, 217, .2], [247, 42, .26], [288, 224, .28], [314, 34, .32],
  [348, 47, .22], [378, 221, .3], [410, 39, .28], [447, 68, .35], [465, 202, .2], [64, 190, .22],
  [423, 187, .25], [18, 178, .2], [458, 111, .22], [276, 34, .2]
]

function polygon(ctx: Ctx, points: ReadonlyArray<Point>, color: string, alpha = 1) {
  const minY = Math.min(...points.map(point => point[1]))
  const maxY = Math.max(...points.map(point => point[1]))
  for (let y = minY; y <= maxY; y++) {
    const cuts: number[] = []
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]!
      const [x2, y2] = points[(i + 1) % points.length]!
      if (y1 === y2 || y < Math.min(y1, y2) || y >= Math.max(y1, y2)) continue
      cuts.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    }
    cuts.sort((a, b) => a - b)
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const left = Math.ceil(cuts[i]!)
      const right = Math.floor(cuts[i + 1]!)
      if (right >= left) rect(ctx, left, y, right - left + 1, 1, color, alpha)
    }
  }
}

function ellipseBand(ctx: Ctx, cx: number, cy: number, outerRx: number, outerRy: number, innerRx: number, innerRy: number, color: string, side: 'both' | 'right' = 'both') {
  for (let dy = -outerRy; dy <= outerRy; dy++) {
    const outerHalf = Math.floor(outerRx * Math.sqrt(Math.max(0, 1 - dy * dy / (outerRy * outerRy))))
    const innerHalf = Math.abs(dy) < innerRy ? Math.floor(innerRx * Math.sqrt(Math.max(0, 1 - dy * dy / (innerRy * innerRy)))) : 0
    if (side === 'both' || side === 'right') rect(ctx, cx + innerHalf, cy + dy, outerHalf - innerHalf + 1, 1, color)
    if (side === 'both') rect(ctx, cx - outerHalf, cy + dy, outerHalf - innerHalf + 1, 1, color)
  }
}

function ellipseEdge(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, side: 'both' | 'right' = 'both') {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))))
    rect(ctx, cx + half, cy + dy, 1, 1, color)
    if (side === 'both') rect(ctx, cx - half, cy + dy, 1, 1, color)
  }
}

function drawSpace(ctx: Ctx) {
  const p = PILGRIM_V2_PALETTE
  rect(ctx, 0, 0, 480, 270, p.space)
  polygon(ctx, [[0, 38], [116, 0], [175, 0], [57, 43], [0, 59]], '#17142a', .3)
  polygon(ctx, [[361, 270], [480, 215], [480, 249], [435, 270]], '#17142a', .28)
  for (const [x, y, alpha] of SKY_POINTS) rect(ctx, x, y, 1, 1, p.star, alpha)
  for (const [x, y] of [[92, 82], [391, 72], [52, 191], [457, 187]] as const) {
    rect(ctx, x - 2, y, 5, 1, p.steel, .3)
    rect(ctx, x, y - 2, 1, 5, p.steelLight, .24)
  }
  rect(ctx, 0, 0, 480, 3, p.deep, .75)
  rect(ctx, 0, 267, 480, 3, p.deep, .75)
}

function drawRingBack(ctx: Ctx) {
  const r = PILGRIM_V2_LAYOUT.ring
  const p = PILGRIM_V2_PALETTE
  ellipseBand(ctx, r.cx, r.cy, r.outerRx, r.outerRy, r.innerRx, r.innerRy, p.deep)
  ellipseEdge(ctx, r.cx, r.cy, r.outerRx, r.outerRy, p.steel)
  ellipseEdge(ctx, r.cx, r.cy, r.innerRx, r.innerRy, p.plateLight)
  ellipseBand(ctx, r.cx, r.cy, r.outerRx - 2, r.outerRy - 2, r.innerRx + 2, r.innerRy + 2, p.hullMid)
}

function drawHull(ctx: Ctx) {
  const p = PILGRIM_V2_PALETTE
  // A long, shallow armored monohull: the left bow runs low; the compact aft is stepped.
  const shell: Point[] = [
    [24, 139], [37, 130], [59, 121], [86, 111], [114, 103], [145, 95], [177, 88], [212, 83],
    [249, 81], [283, 82], [316, 84], [345, 91], [373, 100], [399, 109], [425, 119], [455, 132],
    [449, 139], [429, 145], [404, 151], [377, 158], [348, 165], [317, 172], [285, 179], [252, 183],
    [220, 181], [188, 175], [157, 168], [128, 160], [99, 153], [74, 147], [51, 143], [33, 142]
  ]
  polygon(ctx, shell, p.deep)
  polygon(ctx, [[29, 138], [48, 128], [78, 117], [111, 108], [145, 99], [179, 92], [213, 88], [249, 86], [284, 87], [316, 89], [345, 96], [373, 105], [401, 114], [432, 126], [447, 134], [428, 141], [404, 147], [377, 154], [349, 161], [318, 168], [286, 175], [252, 179], [220, 177], [188, 171], [157, 164], [128, 156], [100, 149], [75, 144], [52, 141], [34, 140]], p.hull)

  // Broad, gently sloped armour fields read as overlapping hull plates, not exposed city blocks.
  polygon(ctx, [[43, 132], [69, 120], [103, 111], [138, 102], [168, 96], [188, 98], [177, 119], [143, 130], [106, 137], [72, 140], [51, 139]], p.hullLight)
  polygon(ctx, [[82, 142], [117, 137], [151, 130], [181, 121], [204, 117], [212, 142], [189, 151], [154, 153], [119, 150]], p.hullMid)
  polygon(ctx, [[300, 94], [326, 94], [353, 101], [383, 110], [413, 120], [439, 131], [423, 140], [397, 146], [370, 152], [341, 157], [314, 151]], p.hullLight)
  polygon(ctx, [[304, 150], [333, 158], [360, 153], [389, 146], [416, 140], [399, 151], [375, 158], [348, 165], [317, 172], [287, 178]], p.hullMid)

  // Closed civic and navigation masses are low and gathered above the aft half.
  polygon(ctx, [[245, 87], [264, 80], [280, 77], [296, 80], [306, 88], [303, 97], [283, 101], [260, 98]], p.hullMid)
  polygon(ctx, [[301, 89], [313, 79], [325, 73], [338, 74], [345, 82], [346, 94], [332, 98], [313, 96]], p.hullLight)
  polygon(ctx, [[335, 93], [347, 84], [357, 82], [365, 88], [369, 100], [358, 103], [342, 100]], p.hullMid)
  polygon(ctx, [[372, 105], [386, 98], [398, 101], [401, 109], [390, 114], [376, 112]], p.hullMid)
  rect(ctx, 322, 68, 2, 8, p.steelLight)
  rect(ctx, 333, 69, 2, 6, p.warm)
  rect(ctx, 351, 77, 2, 7, p.steel)
  rect(ctx, 321, 66, 2, 2, p.warmLight)
  rect(ctx, 332, 67, 2, 2, p.warmLight)
  rect(ctx, 351, 75, 2, 2, p.warmLight)

  // Long seams, replacement plates, and two recessed service runs.
  line(ctx, 72, 119, 86, 143, p.seam, 2)
  line(ctx, 117, 106, 129, 137, p.seam, 2)
  line(ctx, 158, 98, 168, 127, p.seam, 2)
  line(ctx, 200, 91, 204, 120, p.seam, 2)
  line(ctx, 356, 102, 366, 133, p.seam, 2)
  line(ctx, 397, 113, 404, 141, p.seam, 2)
  polygon(ctx, [[124, 111], [143, 106], [157, 109], [153, 126], [131, 131]], p.plate)
  polygon(ctx, [[360, 116], [379, 111], [390, 117], [386, 137], [365, 142]], p.plate)
  polygon(ctx, [[194, 153], [216, 157], [219, 169], [203, 171], [189, 166]], p.plate)
  for (const [x, y, w] of [[125, 113, 22], [362, 118, 22], [194, 156, 24]] as const) {
    rect(ctx, x, y, w, 1, p.plateLight, .7)
    rect(ctx, x + 2, y + 7, w - 4, 1, p.seam, .9)
  }

  // Shielded windows sit in narrow horizontal recesses along the hull side.
  for (const [x, y, w] of [[87, 140, 11], [101, 144, 8], [153, 140, 13], [169, 143, 9], [316, 131, 12], [332, 134, 8], [373, 131, 10]] as const) {
    rect(ctx, x - 2, y - 2, w + 4, 5, p.deep)
    rect(ctx, x, y, w, 1, p.warm, .82)
    if (w > 9) rect(ctx, x + 1, y - 1, w - 3, 1, p.warmLight, .58)
  }

  drawMissionMark(ctx, 112, 119)

  // Continuous underside armour stays thin so the ship reads long, not whale-shaped.
  line(ctx, 48, 145, 108, 157, p.plateLight, 1)
  line(ctx, 108, 157, 181, 174, p.steelLight, 1)
  line(ctx, 181, 174, 224, 180, p.plateLight, 1)
  line(ctx, 312, 171, 352, 162, p.plateLight, 1)
  line(ctx, 352, 162, 406, 149, p.steelLight, 1)
  for (let x = 112; x <= 374; x += 24) {
    const y = x < 260 ? 159 + Math.round((x - 112) * .08) : 171 - Math.round((x - 260) * .12)
    rect(ctx, x, y, 1, 4, p.plateLight, .58)
  }

  // Compact aft service cluster with only a restrained cool reflection.
  polygon(ctx, [[389, 116], [418, 123], [447, 133], [433, 140], [410, 145], [388, 148]], p.hull)
  rect(ctx, 418, 127, 21, 3, p.plate)
  rect(ctx, 421, 128, 15, 1, p.cool, .62)
  rect(ctx, 435, 131, 13, 2, p.steel)
  rect(ctx, 439, 133, 11, 1, p.cool, .72)
  for (let y = 129; y < 142; y += 4) rect(ctx, 409, y, 6, 2, p.plateLight, .75)
}

function drawMissionMark(ctx: Ctx, cx: number, cy: number) {
  const p = PILGRIM_V2_PALETTE
  polygon(ctx, [[cx, cy - 8], [cx + 2, cy - 2], [cx + 8, cy], [cx + 2, cy + 2], [cx, cy + 8], [cx - 2, cy + 2], [cx - 8, cy], [cx - 2, cy - 2]], p.warm)
  rect(ctx, cx - 1, cy - 1, 3, 3, p.warmLight)
  rect(ctx, cx - 12, cy, 3, 1, p.steelLight, .8)
}

function drawRingFront(ctx: Ctx, seconds: number, motion: boolean) {
  const r = PILGRIM_V2_LAYOUT.ring
  const p = PILGRIM_V2_PALETTE
  const pulse = motion ? .83 + .11 * Math.sin(2 * Math.PI * seconds / 7.5) : .83
  ellipseBand(ctx, r.cx, r.cy, r.outerRx, r.outerRy, r.innerRx, r.innerRy, p.hullMid, 'right')
  ellipseEdge(ctx, r.cx, r.cy, r.outerRx, r.outerRy, p.plateLight, 'right')
  ellipseEdge(ctx, r.cx, r.cy, r.innerRx, r.innerRy, p.steelLight, 'right')
  for (let dy = -58; dy <= 58; dy += 11) {
    const outer = Math.floor(r.outerRx * Math.sqrt(Math.max(0, 1 - dy * dy / (r.outerRy * r.outerRy))))
    const inner = Math.floor(r.innerRx * Math.sqrt(Math.max(0, 1 - dy * dy / (r.innerRy * r.innerRy))))
    rect(ctx, r.cx + inner + 1, r.cy + dy, Math.max(3, outer - inner - 1), 3, p.warm, pulse)
    rect(ctx, r.cx + inner + 2, r.cy + dy, 2, 1, p.warmLight, pulse)
  }
  rect(ctx, r.cx + 15, r.cy - 65, 5, 2, p.warm, pulse)
  rect(ctx, r.cx + 17, r.cy + 63, 4, 2, p.warm, pulse)
  rect(ctx, r.cx - 27, r.cy - 5, 4, 10, p.warm, .12 * pulse)
}

/** Draw one deterministic pixel frame; it reads no game state, RNG, or simulation clock. */
export function drawPilgrimArkV2(ctx: Ctx, seconds = 0, motion = true) {
  const t = Number.isFinite(seconds) ? seconds : 0
  drawSpace(ctx)
  drawRingBack(ctx)
  drawHull(ctx)
  drawRingFront(ctx, t, motion)
  const p = PILGRIM_V2_PALETTE
  for (let i = 0; i < 7; i++) {
    const a = motion ? .68 + .14 * Math.sin(2 * Math.PI * t / 5 + i * .7) : .68
    rect(ctx, 341 + i * 3, 95 + (i % 2) * 2, 1, 2, i === 6 ? p.cool : p.warm, a)
  }
  rect(ctx, 0, 0, 480, 1, p.steel, .7)
}
