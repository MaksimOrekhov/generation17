import { describe, expect, it } from 'vitest'
import bundle from '../bundle.json'
import { collectKnown, validateContent } from '../validate'
import { codeStorylets } from '../../domain/storylets'
import { codeMoments } from '../../domain/moments'
import type { JsonMoment, JsonStorylet } from '../types'

const known = collectKnown(codeStorylets, codeMoments)
const story = () => {
  const s = { ...structuredClone(bundle.storylets.find(s => s.id === 'tin-whistle')!), id: 't6-money-fixture', requires: undefined } as JsonStorylet
  s.choices.forEach((c, i) => { c.id = `answer-${i}` })
  return s
}
const moment = () => ({ ...structuredClone(bundle.moments.find(m => !m.needs?.includes('child'))!), id: 'm-t6-money-fixture', requires: undefined }) as JsonMoment
const errors = (value: unknown, kind: 'storylets' | 'moments' = 'storylets') => validateContent([{ path: 'fixture.json', kind, data: [value] }], known).filter(i => i.level === 'error')

describe('T6 content contract', () => {
  it('accepts all financial requirements with their inclusive boundaries and known IDs', () => {
    const s = story()
    s.requires = { money: { min: 0, max: Number.MAX_SAFE_INTEGER }, work: ['child', 'trainee', 'working', 'between', 'sick', 'retired'],
      grade: { min: 1, max: 4 }, housing: { min: 0, max: 2 }, reserveYears: { min: 0, max: 1000 },
      owns: ['own-cabin', 'dome-pass', 'visit-sector-bio'], ownsNot: ['visit-sector-clinic'] }
    expect(errors(s)).toEqual([])
  })
  it('accepts tenths of a year without rounding the actual reserve', () => {
    const s = story(); s.requires = { reserveYears: { min: .1, max: 37.7 } }
    expect(errors(s)).toEqual([])
  })
  it.each([
    ['money', {}], ['money', { min: 400, max: 399 }], ['money', { min: -1 }], ['money', { max: '100' }],
    ['money', { min: 1.5 }], ['money', { max: Number.MAX_SAFE_INTEGER + 1 }], ['money', { min: 0, typo: 1 }], ['money', []],
    ['grade', { min: 0 }], ['grade', { max: 5 }], ['grade', { min: 1.1 }], ['grade', { min: 3, max: 2 }],
    ['housing', { min: -1 }], ['housing', { max: 3 }], ['housing', { min: 1.5 }], ['housing', {}],
    ['reserveYears', { min: -1 }], ['reserveYears', { max: 1000.1 }], ['reserveYears', { min: .01 }],
    ['reserveYears', { min: NaN }], ['reserveYears', { max: Infinity }], ['reserveYears', { min: 3, max: 2 }],
    ['work', ['Техник']], ['work', 'working'], ['work', [1]], ['owns', ['missing-offer']], ['ownsNot', ['constructor']],
    ['owns', ['visit-sector-missing']], ['ownsNot', 42], ['monye', { min: 100 }]
  ])('rejects malformed requires.%s = %j', (key, value) => {
    const s = story(); s.requires = { [key as string]: value } as JsonStorylet['requires']
    expect(errors(s).some(e => e.where.includes('requires'))).toBe(true)
  })
  it.each([-1500, -400, 0, 250, 1500])('accepts signed integer effect %i with a free alternative', money => {
    const s = story(); s.choices[0]!.effects.money = money; s.choices[1]!.effects = {}
    expect(errors(s)).toEqual([])
  })
  it.each(['400', .5, NaN, Infinity, -Infinity, -1501, 1501, Number.MAX_SAFE_INTEGER + 1, null])('rejects invalid effects.money %s', money => {
    const s = story(); s.choices[0]!.effects.money = money as number
    expect(errors(s).some(e => e.where.endsWith('.money'))).toBe(true)
  })
  it('requires a guaranteed free exit, even if a paid check could refund the price', () => {
    const s = story()
    for (const choice of s.choices) {
      choice.effects.money = -400
      choice.check = { skill: 'engineering', difficulty: 20, success: { money: 400 }, failure: {},
        successText: 'Средства вернулись после успешного результата проверки.', failureText: 'Проверка завершилась без возврата потраченных средств.' }
    }
    expect(errors(s).some(e => e.message.includes('без обязательного денежного расхода'))).toBe(true)
    s.choices[1]!.effects.money = 0
    s.choices[1]!.check = undefined // the guaranteed exit also has no contingent reward overflow
    expect(errors(s)).toEqual([])
  })
  it.each(['success', 'failure'] as const)('rejects negative skill-check %s', branch => {
    const s = story()
    s.choices[0]!.check = { skill: 'engineering', difficulty: 20, success: {}, failure: {},
      successText: 'Средства получены после успешного результата проверки.', failureText: 'Проверка завершилась без изменения денежных средств.' }
    s.choices[0]!.check![branch].money = -1
    expect(errors(s).some(e => e.where.endsWith(`check.${branch}.money`))).toBe(true)
    s.choices[0]!.check![branch].money = 250
    expect(errors(s)).toEqual([])
  })
  it.each(['accept', 'skip'] as const)('rejects negative moment %s.effects and permits a positive reward', side => {
    const m = moment()
    if (!m[side].effects) m[side].effects = {}
    m[side].effects!.money = -1
    expect(errors(m, 'moments').some(e => e.where.endsWith(`${side}.effects.money`))).toBe(true)
    m[side].effects!.money = 250
    expect(errors(m, 'moments')).toEqual([])
  })
})
