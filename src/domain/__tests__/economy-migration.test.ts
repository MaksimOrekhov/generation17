import { describe, expect, it } from 'vitest'
import { createGame } from '../engine'
import { repairSave } from '../save'
import { settleYear, repairEconomy } from '../economy'
import type { GameState } from '../types'

const oldSave = (age: number) => {
  const g = createGame(42)
  g.age = age
  g.protagonist.job = 'Техник'
  g.skills.engineering = 25
  g.flags.marker = 'preserved'
  g.memories.push('Память остаётся')
  g.pending = 'school-track'
  const raw = JSON.parse(JSON.stringify(g)) as GameState
  delete (raw as unknown as { economy?: unknown }).economy
  return raw
}

describe('миграция старых сохранений экономики', () => {
  it.each([[5, 'child'], [17, 'trainee'], [30, 'working'], [60, 'working'], [80, 'retired']] as const)('возраст %i: статус %s и без повторной выплаты', (age, kind) => {
    const original = oldSave(age)
    const preserved = { rng: original.rng, seed: original.seed, people: structuredClone(original.people), memories: [...original.memories], history: structuredClone(original.history), pending: original.pending, flags: structuredClone(original.flags) }
    const result = repairSave(original).game
    expect(result.economy.work.kind).toBe(kind)
    expect(result.economy.settledAge).toBe(age)
    expect(result).toMatchObject(preserved)
    expect((original as unknown as { economy?: unknown }).economy).toBeUndefined()
    const before = structuredClone(result.economy)
    settleYear(result)
    expect(result.economy).toEqual(before)
    expect(repairSave(JSON.parse(JSON.stringify(result)) as GameState).game.economy).toEqual(before)
  })
  it('старый пенсионный флаг означает выход, но не платное наставничество', () => {
    const old = oldSave(60); old.flags.retirement = true; old.flags.mentored = true
    const e = repairSave(old).game.economy
    expect(e.work.kind).toBe('retired'); expect(e.work.path).toBe('left'); expect(e.work.mentor).toBe(false)
  })
  it('нулевые курсы ограничивают восстановленный разряд, сохранённый разряд не теряется', () => {
    const old=oldSave(60); old.skills.engineering=100
    const g=repairSave(old).game
    expect(g.economy.work.grade).toBe(2)
    g.economy.work.grade=4; g.economy.work.courses=2
    expect(repairEconomy(g).work.grade).toBe(4)
  })
  it('частичные и повреждённые данные исправляются без изменения жизни', () => {
    const g=oldSave(30)
    ;(g as unknown as {economy: unknown}).economy={v:1,balance:NaN,work:{kind:'unknown',grade:99,service:-2,lastWage:Infinity},settledAge:NaN,years:[null,{age:30,wage:-2}],ledger:[null],totals:{aid:-2},services:null}
    const before=structuredClone(g)
    const repaired=repairSave(g).game
    expect(g).toEqual(before)
    expect(repaired.rng).toBe(g.rng); expect(repaired.memories).toEqual(g.memories); expect(repaired.pending).toBe(g.pending)
    expect(Number.isInteger(repaired.economy.balance)).toBe(true)
    expect(repaired.economy.work.grade).toBe(4)
    expect(repaired.economy.work.service).toBeGreaterThanOrEqual(0)
    expect(repaired.economy.settledAge).toBe(30)
    expect(repaired.economy.totals.aid).toBe(0)
    const e=structuredClone(repaired.economy); settleYear(repaired); expect(repaired.economy).toEqual(e)
  })
  it('повреждённый объект экономики заменяется, не сбрасывая историю', () => {
    const g=oldSave(30); (g as unknown as {economy: unknown}).economy=null
    const repaired=repairSave(g).game
    expect(repaired.history).toEqual(g.history); expect(repaired.economy.settledAge).toBe(30)
  })
})
