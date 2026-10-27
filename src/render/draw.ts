export type Ctx = CanvasRenderingContext2D

/** Закрашенный прямоугольник с целыми координатами: основа пиксельной графики. */
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, alpha = 1) {
  if (alpha !== 1) ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  if (alpha !== 1) ctx.globalAlpha = 1
}

/** Линия из прямоугольников толщиной `t` — без сглаживания. */
export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, t = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let i = 0; i <= steps; i++) {
    const k = steps === 0 ? 0 : i / steps
    rect(ctx, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, t, t, color)
  }
}

/** Закрашенный круг, нарисованный попиксельно. */
export function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string, alpha = 1) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y))
    rect(ctx, cx - half, cy + y, half * 2 + 1, 1, color, alpha)
  }
}

export function makeLayer(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/** Смешивает hex-цвет с другим: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number) {
  const pa = parse(a)
  const pb = parse(b)
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function parse(hex: string) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}
