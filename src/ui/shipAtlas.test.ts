import { describe, expect, it } from 'vitest'
import { createGame } from '../domain/engine'
import { sectors } from '../domain/birth'
import { SHIP_ATLAS_DETAIL_NOTE, SHIP_ATLAS_OVERVIEW_NOTE, SHIP_ATLAS_UNKNOWN_LOCATION, shipAtlasSector, shipAtlasSectors } from './shipAtlas'

describe('ship atlas view model', () => {
  it('lists exactly the five grounded sectors with their existing names and deck labels', () => {
    const game = createGame(17)
    const model = shipAtlasSectors(game)
    expect(model.map(({ id, name, code }) => ({ id, name, code }))).toEqual(
      sectors.map(({ id, name, deck }) => ({ id, name, code: deck }))
    )
    expect(model).toHaveLength(5)
    expect(model.filter(sector => sector.isHome)).toHaveLength(1)
  })

  it('uses current residence for the home marker and falls back to birth sector in older saves', () => {
    const game = createGame(29)
    const snapshot = structuredClone(game)
    expect(shipAtlasSectors(game).find(sector => sector.isHome)?.id).toBe(game.birth.sectorId)
    const moved = { ...game, residence: sectors.find(sector => sector.id !== game.birth.sectorId)!.id }
    expect(shipAtlasSectors(moved).find(sector => sector.isHome)?.id).toBe(moved.residence)
    expect(shipAtlasSector(moved, moved.residence!).isHome).toBe(true)
    expect(game).toEqual(snapshot)
  })

  it('keeps physical location unknown and labels both atlas levels as illustrative', () => {
    expect(SHIP_ATLAS_UNKNOWN_LOCATION).toBe('Текущее местоположение неизвестно')
    expect(SHIP_ATLAS_OVERVIEW_NOTE).toContain('точное размещение не установлено')
    expect(SHIP_ATLAS_DETAIL_NOTE).toContain('точное расположение не установлено')
  })

  it('provides at least three sector-specific reference landmarks without defining room routes', () => {
    const game = createGame(43)
    const model = shipAtlasSectors(game)
    expect(model.every(sector => sector.landmarks.length >= 3)).toBe(true)
    expect(new Set(model.map(sector => sector.landmarks.join('|'))).size).toBe(5)
    expect(model.flatMap(sector => sector.landmarks).some(label => /дверь|переход|маршрут|комната №/i.test(label))).toBe(false)
  })
})
