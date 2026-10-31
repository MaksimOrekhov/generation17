import { describe, expect, it } from 'vitest'
import type { SpotId } from '../domain/types'
import { SCENE_H, SCENE_W, pickScene, resolveScene, sceneRegistry } from './scene'
import type { SceneContext, SceneModel, SceneResolution } from './scene'

function context(overrides: Partial<SceneContext> = {}): SceneContext {
  return {
    started: true, momentId: null, momentSpot: null, pendingStorylet: false,
    hasDecision: false, resultVisible: false, stopped: false, shopOpen: false,
    residenceSectorId: 'bio', ...overrides
  }
}

function model(scene: SceneResolution): SceneModel {
  return { name: 'Ari', age: 24, wealth: 3, sectorId: 'bio', companion: null, scene }
}

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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, operations }
}

describe('SceneView scene selection', () => {
  it('uses only the three exact curated moment IDs and labels them as illustrations', () => {
    const curated: Array<[string, SpotId, string, SpotId | null]> = [
      ['m-night-archive', 'terminal', 'edu.archive', 'terminal'],
      ['m-job-agro', 'plant', 'bio.greenhouse', null],
      ['m-night-deck', 'window', 'public.observation', 'window']
    ]
    for (const [momentId, momentSpot, sceneId, spot] of curated) {
      const scene = resolveScene(context({ momentId, momentSpot }))
      expect(scene.sceneId).toBe(sceneId)
      expect(scene.presentation).toBe('illustration')
      expect(scene.label).toContain('Иллюстрация')
      expect(scene.spot).toBe(spot)
    }
  })

  it('falls back honestly and gives pending storylets priority over visible moments', () => {
    expect(resolveScene(context({ momentId: 'm-terminal-copy', momentSpot: 'terminal' })).sceneId).toBe('event.neutral')
    expect(resolveScene(context({ momentId: 'm-garden-plot', momentSpot: 'plant' })).sceneId).toBe('event.neutral')
    expect(resolveScene(context({ momentId: 'm-night-archive', momentSpot: 'terminal', pendingStorylet: true })).fallbackReason).toBe('pending-storylet')
    expect(resolveScene(context({ pendingStorylet: true, momentId: 'm-night-deck', momentSpot: 'window' })).sceneId).toBe('event.neutral')
  })

  it('keeps result, stopped life and decisions out of event illustrations', () => {
    expect(resolveScene(context({ momentId: 'm-night-archive', resultVisible: true })).fallbackReason).toBe('result')
    expect(resolveScene(context({ momentId: 'm-night-deck', stopped: true })).fallbackReason).toBe('ended')
    expect(resolveScene(context({ momentId: 'm-night-archive', hasDecision: true })).fallbackReason).toBe('decision')
  })

  it('uses current residence for the home label and never derives location from age or profession', () => {
    const home = resolveScene(context({ residenceSectorId: 'engineering' }))
    expect(home.sceneId).toBe('home.cabin')
    expect(home.label).toContain('Инженерный сектор')
    expect(home.label).not.toContain('A-6')
    expect(resolveScene(context({ residenceSectorId: 'lower' })).sceneId).toBe('home.cabin')
  })

  it('only highlights the same semantic anchor in an illustrated room', () => {
    expect(resolveScene(context({ momentId: 'm-job-agro', momentSpot: 'plant' })).spot).toBeNull()
    expect(resolveScene(context({ momentId: 'm-night-archive', momentSpot: 'plant' })).spot).toBeNull()
    expect(resolveScene(context({ momentId: 'm-night-deck', momentSpot: 'table' })).spot).toBeNull()
    expect(resolveScene(context({ momentId: 'm-night-deck', momentSpot: 'window' })).spot).toBe('window')
  })
})

describe('procedural scene renderers', () => {
  it('registers exactly the five pilot keys', () => {
    expect(Object.keys(sceneRegistry).sort()).toEqual([
      'bio.greenhouse', 'edu.archive', 'event.neutral', 'home.cabin', 'public.observation'
    ])
    expect([SCENE_W, SCENE_H]).toEqual([480, 270])
  })

  it('renders deterministic, distinct complete static frames for the three new rooms and neutral fallback', () => {
    const ids = ['event.neutral', 'edu.archive', 'bio.greenhouse', 'public.observation'] as const
    const frames = ids.map(id => {
      const scene = { ...resolveScene(context()), sceneId: id } as SceneResolution
      const first = recordingContext()
      const second = recordingContext()
      pickScene(model(scene)).draw(first.ctx, 0, model(scene))
      pickScene(model(scene)).draw(second.ctx, 0, model(scene))
      expect(first.operations.length).toBeGreaterThan(100)
      expect(first.operations).toEqual(second.operations)
      return first.operations
    })
    expect(new Set(frames.map(frame => JSON.stringify(frame))).size).toBe(4)
  })

  it('keeps the selected frame deterministic across 100 cosmetic animation samples without changing state', () => {
    const scene = resolveScene(context({ momentId: 'm-job-agro', momentSpot: 'plant' }))
    const fixture = model(scene)
    const before = JSON.stringify(fixture)
    for (let i = 0; i < 120; i++) {
      const frame = recordingContext()
      pickScene(fixture).draw(frame.ctx, i / 30, fixture)
      expect(frame.operations.length).toBeGreaterThan(100)
    }
    expect(JSON.stringify(fixture)).toBe(before)
    const stillA = recordingContext(); const stillB = recordingContext()
    pickScene(fixture).draw(stillA.ctx, 0, fixture)
    pickScene(fixture).draw(stillB.ctx, 0, fixture)
    expect(stillA.operations).toEqual(stillB.operations)
  })
})
