import { afterEach, describe, expect, it, vi } from 'vitest'
import { residenceOf } from '../domain/birth'
import { createGame } from '../domain/engine'
import { beginRelationship, endRelationship } from '../domain/people'
import type { GameState, Person } from '../domain/types'
import { cabinScene } from './cabin'
import { householdLook } from './household'
import { resolveScene } from './scene'
import type { SceneContext, SceneModel, SceneResolution } from './scene'

const homeContext = (g: GameState, overrides: Partial<SceneContext> = {}): SceneContext => ({
  started: true, momentId: null, momentSpot: null, pendingStorylet: false,
  hasDecision: false, resultVisible: false, stopped: false, shopOpen: false,
  residenceSectorId: residenceOf(g), ...overrides
})
const homeScene = (g: GameState) => resolveScene(homeContext(g))

/** Взрослая жизнь с подтверждённым текущим партнёром и общим домом — тем же состоянием, что создаёт движок. */
function sharedLife(): GameState {
  const g = createGame(17017)
  g.age = 24
  const friend: Person = { id: 'friend', name: 'Тес', role: 'friend', bond: 70, age: 24, alive: true, since: 5, state: { sectorId: residenceOf(g), availability: 'available' } }
  g.people = [...g.people.filter(p => p.id !== 'friend'), friend]
  g.relationships = { partnerId: null, formerPartnerIds: [] }
  expect(beginRelationship(g, 'friend')).toBe(true)
  g.flags.livingTogether = true
  return g
}
const partnerOf = (g: GameState) => g.people.find(p => p.id === 'friend')!
const otherSector = (g: GameState) => residenceOf(g) === 'lower' ? 'bio' : 'lower'

describe('householdLook guard', () => {
  it('is shared only for a verified current partner living together in the idle home cabin', () => {
    const g = sharedLife()
    expect(householdLook(g, homeScene(g))).toBe('shared')
  })

  it.each<[string, (g: GameState) => void]>([
    ['no explicit relationships model (legacy)', g => { delete g.relationships; g.flags.loveStage = 'together'; g.flags.lovePath = 'confessed' }],
    ['partnerId empty', g => { g.relationships = { partnerId: null, formerPartnerIds: [] } }],
    ['partner id unknown', g => { g.relationships = { partnerId: 'nobody', formerPartnerIds: [] } }],
    ['partner also listed as former', g => { g.relationships!.formerPartnerIds = ['friend'] }],
    ['livingTogether false', g => { g.flags.livingTogether = false }],
    ['livingTogether absent', g => { delete g.flags.livingTogether }],
    ['livingTogether not strictly true', g => { g.flags.livingTogether = 1 }],
    ['partner dead', g => { partnerOf(g).alive = false }],
    ['partner not yet known (since > age)', g => { partnerOf(g).since = g.age + 1 }],
    ['partner distant', g => { partnerOf(g).state!.availability = 'distant' }],
    ['partner sector unknown', g => { delete partnerOf(g).state!.sectorId }],
    ['partner has no state', g => { delete partnerOf(g).state }],
    ['partner lives in another sector', g => { partnerOf(g).state!.sectorId = otherSector(g) }],
    ['hero moved away from partner', g => { g.residence = otherSector(g) }],
    ['relationship ended', g => { endRelationship(g) }]
  ])('stays ordinary: %s', (_name, mutate) => {
    const g = sharedLife()
    mutate(g)
    expect(householdLook(g, homeScene(g))).toBe('ordinary')
  })

  it('stays ordinary for parents, siblings and children alone, whatever their bond or sector', () => {
    const g = createGame(17017)
    g.age = 24
    g.flags.livingTogether = true
    for (const p of g.people) { p.since = 0; p.alive = true; p.state = { ...p.state, sectorId: residenceOf(g), availability: 'available' } }
    g.people.push({ id: 'child', name: 'Ив', role: 'child', bond: 90, age: 2, alive: true, since: 0, state: { sectorId: residenceOf(g) } })
    expect(householdLook(g, homeScene(g))).toBe('ordinary')
    g.relationships = { partnerId: null, formerPartnerIds: [] }
    expect(householdLook(g, homeScene(g))).toBe('ordinary')
  })

  it.each<[string, Partial<SceneContext>]>([
    ['pending storylet', { pendingStorylet: true }],
    ['decision', { hasDecision: true }],
    ['shop', { shopOpen: true }],
    ['result', { resultVisible: true }],
    ['ended life', { stopped: true }],
    ['neutral moment', { momentId: 'm-terminal-copy', momentSpot: 'terminal' }],
    ['archive moment', { momentId: 'm-night-archive', momentSpot: 'terminal' }],
    ['greenhouse moment', { momentId: 'm-job-agro', momentSpot: 'plant' }],
    ['observation moment', { momentId: 'm-night-deck', momentSpot: 'window' }]
  ])('stays ordinary outside idle home: %s', (_name, overrides) => {
    const g = sharedLife()
    expect(householdLook(g, resolveScene(homeContext(g, overrides)))).toBe('ordinary')
  })

  it('does not mutate the game state', () => {
    const g = sharedLife()
    const before = JSON.stringify(g)
    householdLook(g, homeScene(g))
    expect(JSON.stringify(g)).toBe(before)
  })

  it('goes shared → ordinary → shared without leftovers across lifecycle changes', () => {
    const g = sharedLife()
    const scene: SceneResolution = homeScene(g)
    expect(householdLook(g, scene)).toBe('shared')
    partnerOf(g).state!.availability = 'distant'
    expect(householdLook(g, scene)).toBe('ordinary')
    partnerOf(g).state!.availability = 'available'
    expect(householdLook(g, scene)).toBe('shared')
    endRelationship(g)
    expect(householdLook(g, scene)).toBe('ordinary')
    expect(householdLook(sharedLife(), scene)).toBe('shared')
  })
})

describe('cabin household overlay', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Первый прогон прогревает общие кэши модуля; сравниваются только повторные кадры. */
  function render(model: SceneModel, t = 0) {
    draw(model, t)
    return draw(model, t)
  }
  function draw(model: SceneModel, t: number) {
    const ops: unknown[][] = []
    const recorder = () => new Proxy({ globalAlpha: 1, fillStyle: '#000' } as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key]
        if (key === 'fillRect' || key === 'drawImage') return (...args: unknown[]) => { ops.push(key === 'drawImage' ? [key, 'layer', ...args.slice(1), target.globalAlpha] : [key, ...args, String(target.fillStyle), target.globalAlpha]) }
        return () => ({ addColorStop() {} })
      },
      set(target, key: string, value) { target[key] = value; return true }
    })
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: recorder }) })
    cabinScene.draw(recorder() as unknown as CanvasRenderingContext2D, t, model)
    return ops
  }
  const base = (g: GameState, look?: SceneModel['householdLook']): SceneModel => ({
    name: g.protagonist.name, age: g.age, wealth: g.birth.wealth, sectorId: residenceOf(g), companion: null,
    ...(look ? { householdLook: look } : {}), scene: homeScene(g)
  })

  it('draws the same deterministic frame for the same model and t', () => {
    const g = sharedLife()
    expect(render(base(g, 'shared'), 1.5)).toEqual(render(base(g, 'shared'), 1.5))
    expect(render(base(g, 'ordinary'), 1.5)).toEqual(render(base(g, 'ordinary'), 1.5))
  })

  it('adds only the second mug and leaves ordinary output untouched; no variant sticks in the static cache', () => {
    const g = sharedLife()
    const ordinaryFirst = render(base(g, 'ordinary'))
    const shared = render(base(g, 'shared'))
    const ordinaryAfter = render(base(g, 'ordinary'))
    expect(ordinaryAfter).toEqual(ordinaryFirst)
    expect(render(base(g))).toEqual(ordinaryFirst)
    expect(shared.length).toBe(ordinaryFirst.length + 4)
    const added = shared.filter(op => !ordinaryFirst.some(o => JSON.stringify(o) === JSON.stringify(op)))
    expect(added).toHaveLength(4)
    for (const op of added) {
      expect(op[0]).toBe('fillRect')
      const [, x, y, w, h] = op as number[]
      expect(x!).toBeGreaterThanOrEqual(394); expect(x! + w!).toBeLessThanOrEqual(410)
      expect(y!).toBeGreaterThanOrEqual(178); expect(y! + h!).toBeLessThanOrEqual(190)
    }
  })
})
