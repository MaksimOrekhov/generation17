import { describe, expect, it } from 'vitest'
import { drawPilgrimArkV2, PILGRIM_V2_LAYOUT, PILGRIM_V2_SIZE } from './pilgrimArkV2'
import { createPilgrimPreviewMotion } from './pilgrimArkV2Motion'

function recordingContext() {
  const operations: Array<[number, number, number, number, string, number]> = []
  const ctx = {
    globalAlpha: 1,
    fillStyle: '#000000',
    fillRect(x: number, y: number, width: number, height: number) {
      operations.push([x, y, width, height, String(this.fillStyle), this.globalAlpha])
    }
  }
  return { ctx, operations }
}

function fakeScheduler() {
  let nextId = 0
  const callbacks = new Map<number, (time: number) => void>()
  return {
    callbacks,
    scheduler: {
      request(callback: (time: number) => void) { const id = ++nextId; callbacks.set(id, callback); return id },
      cancel(id: number) { callbacks.delete(id) }
    },
    step(time: number) {
      const [id, callback] = callbacks.entries().next().value ?? []
      if (id === undefined || !callback) return
      callbacks.delete(id)
      callback(time)
    }
  }
}

describe('A+C Refined v2.0 Pilgrim preview', () => {
  it('uses the 480×270 canvas and keeps one central ring within the protected hull', () => {
    expect(PILGRIM_V2_SIZE).toEqual({ width: 480, height: 270 })
    const { hull, ring } = PILGRIM_V2_LAYOUT
    expect(hull.left).toBeGreaterThanOrEqual(0)
    expect(hull.right).toBeLessThanOrEqual(PILGRIM_V2_SIZE.width)
    expect(ring.cx).toBeGreaterThan(hull.left + 180)
    expect(ring.cx).toBeLessThan(hull.right - 120)
    expect(ring.outerRy).toBeGreaterThan(60)
    expect(ring.outerRx).toBeGreaterThan(ring.innerRx)
  })

  it('renders deterministically and keeps the same static silhouette at every timestamp', () => {
    const first = recordingContext()
    const second = recordingContext()
    drawPilgrimArkV2(first.ctx as CanvasRenderingContext2D, 2.5, true)
    drawPilgrimArkV2(second.ctx as CanvasRenderingContext2D, 2.5, true)
    expect(first.operations).toEqual(second.operations)

    const stillA = recordingContext()
    const stillB = recordingContext()
    drawPilgrimArkV2(stillA.ctx as CanvasRenderingContext2D, 0, false)
    drawPilgrimArkV2(stillB.ctx as CanvasRenderingContext2D, 9, false)
    expect(stillA.operations).toEqual(stillB.operations)
  })

  it('is fully static and cannot be switched on when reduced motion is requested', () => {
    const scheduler = fakeScheduler()
    const frames: Array<[number, boolean]> = []
    const loop = createPilgrimPreviewMotion({ draw: (seconds, animated) => frames.push([seconds, animated]) }, scheduler.scheduler, true)
    loop.setEnabled(true)
    expect(loop.enabled).toBe(false)
    expect(scheduler.callbacks.size).toBe(0)
    expect(frames.at(-1)).toEqual([0, false])
  })

  it('pauses while hidden and resumes without accumulating hidden-tab time', () => {
    const scheduler = fakeScheduler()
    const frames: Array<[number, boolean]> = []
    const loop = createPilgrimPreviewMotion({ draw: (seconds, animated) => frames.push([seconds, animated]) }, scheduler.scheduler)
    scheduler.step(0)
    scheduler.step(1200)
    expect(frames.at(-1)).toEqual([1.2, true])
    loop.setHidden(true)
    expect(scheduler.callbacks.size).toBe(0)
    loop.setHidden(false)
    scheduler.step(101200)
    expect(frames.at(-1)).toEqual([1.2, true])
  })

  it('has no gameplay scene or simulation dependency', () => {
    const rendered = recordingContext()
    expect(() => drawPilgrimArkV2(rendered.ctx as CanvasRenderingContext2D, 1, false)).not.toThrow()
    expect(rendered.operations.length).toBeGreaterThan(500)
  })
})
