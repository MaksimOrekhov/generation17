import { describe, expect, it } from 'vitest'
import { drawPilgrimExterior, PILGRIM_EXTERIOR_LAYOUT, PILGRIM_EXTERIOR_SIZE, rimMarkerPosition } from './pilgrimExterior'

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

describe('Pilgrim exterior F3 preview', () => {
  it('keeps the major silhouette anchors inside the 480×270 frame with a visible drum gap', () => {
    const { safeExtent, foreDrum, spineGap, aftDrum, shield, aftService } = PILGRIM_EXTERIOR_LAYOUT
    expect(PILGRIM_EXTERIOR_SIZE).toEqual({ width: 480, height: 270 })
    for (const anchor of [shield, foreDrum, aftDrum, aftService]) {
      expect(anchor.left).toBeGreaterThanOrEqual(safeExtent.left)
      expect(anchor.right).toBeLessThanOrEqual(safeExtent.right)
      expect(anchor.top).toBeGreaterThanOrEqual(safeExtent.top)
      expect(anchor.bottom).toBeLessThanOrEqual(safeExtent.bottom)
    }
    expect(spineGap.left).toBe(foreDrum.right)
    expect(spineGap.right).toBe(aftDrum.left)
    expect(spineGap.right - spineGap.left).toBeGreaterThanOrEqual(30)
    expect(Math.abs(foreDrum.ry - aftDrum.ry)).toBeLessThanOrEqual(2)
  })

  it('is deterministic for identical inputs and static when motion is disabled', () => {
    const first = recordingContext()
    const second = recordingContext()
    drawPilgrimExterior(first.ctx as CanvasRenderingContext2D, 2.25, true)
    drawPilgrimExterior(second.ctx as CanvasRenderingContext2D, 2.25, true)
    expect(first.operations).toEqual(second.operations)

    const stillA = recordingContext()
    const stillB = recordingContext()
    drawPilgrimExterior(stillA.ctx as CanvasRenderingContext2D, 0, false)
    drawPilgrimExterior(stillB.ctx as CanvasRenderingContext2D, 7.5, false)
    expect(stillA.operations).toEqual(stillB.operations)
  })

  it('moves the two decorative rim markers in opposing directions on an eight-second cycle', () => {
    const foreStart = rimMarkerPosition('fore', 0)
    const aftStart = rimMarkerPosition('aft', 0)
    const foreQuarter = rimMarkerPosition('fore', 2)
    const aftQuarter = rimMarkerPosition('aft', 2)
    expect(rimMarkerPosition('fore', 8)).toEqual(foreStart)
    expect(rimMarkerPosition('aft', 8)).toEqual(aftStart)
    expect(foreQuarter.x - foreStart.x).toBeGreaterThan(0)
    expect(aftQuarter.x - aftStart.x).toBeLessThan(0)
    expect(rimMarkerPosition('fore', 0)).not.toEqual(rimMarkerPosition('fore', 0.5))
  })
})
