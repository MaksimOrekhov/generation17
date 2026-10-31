import { describe, expect, it } from 'vitest'
import type { SectorId } from '../domain/types'
import { drawShipAtlasSector } from './shipAtlas'

const ids: SectorId[] = ['atrium', 'bio', 'engineering', 'clinic', 'lower']

function recordingContext() {
  const operations: Array<[number, number, number, number, string, number]> = []
  const ctx = {
    globalAlpha: 1,
    fillStyle: '#000000',
    imageSmoothingEnabled: false,
    fillRect(x: number, y: number, width: number, height: number) {
      operations.push([x, y, width, height, String(this.fillStyle), this.globalAlpha])
    }
  }
  return { ctx, operations }
}

describe('illustrative ship sector pixel art', () => {
  it('renders five visually distinct, deterministic 480×270 compositions', () => {
    const frames = ids.map(id => {
      const frame = recordingContext()
      drawShipAtlasSector(frame.ctx as CanvasRenderingContext2D, id, 0, false)
      expect(frame.operations.length).toBeGreaterThan(50)
      return frame.operations
    })
    expect(new Set(frames.map(frame => JSON.stringify(frame))).size).toBe(5)

    for (const id of ids) {
      const first = recordingContext()
      const second = recordingContext()
      drawShipAtlasSector(first.ctx as CanvasRenderingContext2D, id, 0, false)
      drawShipAtlasSector(second.ctx as CanvasRenderingContext2D, id, 24, false)
      expect(first.operations).toEqual(second.operations)
    }
  })

  it('animates only illustrative lamps while preserving the same sector layout', () => {
    const still = recordingContext()
    const animated = recordingContext()
    drawShipAtlasSector(still.ctx as CanvasRenderingContext2D, 'bio', 0, false)
    drawShipAtlasSector(animated.ctx as CanvasRenderingContext2D, 'bio', 1, true)
    expect(animated.operations).toHaveLength(still.operations.length)
    expect(animated.operations.map(operation => operation.slice(0, 4))).toEqual(still.operations.map(operation => operation.slice(0, 4)))
    expect(animated.operations).not.toEqual(still.operations)
  })
})
