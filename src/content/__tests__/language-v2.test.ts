import { afterEach, describe, expect, it } from 'vitest'
import biography from './fixtures/biography.json'
import { compileExpiry, compileMoment, compileRequires, compileStorylet, variantText } from '../load'
import { collectKnown, validateContent, validateRegistrations } from '../validate'
import type { JsonStorylet, Requires } from '../types'
import { canChoose, createGame, decide, decideById, dropUnanswerablePending, eligibleMoments, resolveText, storyBody, takeMoment, tick, visibleChoiceIndices } from '../../domain/engine'
import { storyChoiceIndex } from '../../../scripts/economy-pilot-core'
import { codeStorylets, storylets } from '../../domain/storylets'
import { codeMoments, moments } from '../../domain/moments'
import { repairSave } from '../../domain/save'
import { repairDecisions } from '../../domain/decisionMemory'
import { toneOf } from '../../domain/director'
import { findInconsistencies } from '../../domain/invariants'
import { moneyWorker } from '../../domain/__tests__/t6-fixtures'

const originalStories = [...storylets], originalMoments = [...moments]
afterEach(() => { storylets.splice(0, storylets.length, ...originalStories); moments.splice(0, moments.length, ...originalMoments) })
const json = () => structuredClone(biography) as JsonStorylet[]
function state() {
  const g = moneyWorker(1000)
  g.pending = 'archive-return'
  g.age = 45
  g.decisions = [{ id: 'archive-help', choice: 'help', age: 20 }]
  g.seen = ['archive-help']
  g.people.forEach(p => { p.alive = true; p.since = 0; p.bond = 50 })
  g.skills.engineering = 12
  g.ship.air = 60
  g.birth.wealth = 3
  g.protagonist.trait = 'Любознательный'
  return g
}
function install(items = json()) { const compiled = items.map(compileStorylet); storylets.push(...compiled); return compiled }
const known = () => collectKnown(codeStorylets, codeMoments)
function errors(items: unknown[] = json()) {
  return validateContent([{ path: 'test.json', kind: 'storylets', data: items }], known()).filter(i => i.level === 'error')
}

describe('v2 conditions: positive, negative, inclusive boundaries and missing facts', () => {
  const cases: [Requires, boolean][] = [
    [{ any: [{ job: ['Техник'] }, { skill: { engineering: { min: 12 } } }] }, true],
    [{ any: [{ skill: { engineering: { min: 13 } } }, { dead: ['parent'] }] }, false],
    [{ any: [{ skill: { engineering: { min: 12 } } }], money: { min: 1001 } }, false],
    [{ any: [{ any: [{ bond: { parent: { min: 50, max: 50 } } }] }] }, true],
    [{ seen: ['archive-help'], notSeen: ['archive-return'] }, true],
    [{ seen: ['missing'] }, false], [{ notSeen: ['archive-help'] }, false],
    [{ chose: { 'archive-help': ['help'] } }, true], [{ chose: { 'archive-help': ['refuse'] } }, false],
    [{ chose: { missing: ['help'] } }, false],
    [{ decisionYears: { 'archive-help': { min: 25, max: 25 } } }, true],
    [{ decisionYears: { 'archive-help': { min: 26 } } }, false],
    [{ decisionYears: { missing: { max: 25 } } }, false],
    [{ chose: { 'archive-help': ['refuse'] }, decisionYears: { 'archive-help': { min: 25 } } }, false],
    [{ bond: { parent: { min: 50, max: 50 } } }, true], [{ bond: { parent: { min: 51 } } }, false],
    [{ bond: { child: { max: 100 } } }, false],
    [{ skill: { engineering: { min: 12, max: 12 } } }, true], [{ skill: { engineering: { max: 11 } } }, false],
    [{ ship: { air: { min: 60, max: 60 } } }, true], [{ ship: { air: { min: 61 } } }, false],
    [{ birthWealth: { min: 3, max: 3 } }, true], [{ birthWealth: { max: 2 } }, false],
    [{ trait: ['Любознательный'] }, true], [{ trait: ['Упрямый'] }, false],
    [{ present: ['parent'], alive: ['parent'], exists: ['parent'] }, true],
    [{ dead: ['parent'] }, false], [{ absent: ['child'] }, true], [{ dead: ['child'] }, false],
    [{ exists: ['child'] }, false], [{ absent: ['parent'] }, false]
  ]
  it.each(cases)('%j → %s', (condition, expected) => {
    const g = state(), before = structuredClone(g)
    const predicate = compileRequires(condition)
    expect(predicate(g)).toBe(expected); expect(predicate(g)).toBe(expected); expect(g).toEqual(before)
  })
  it('distinguishes never appeared, not yet known, living and dead', () => {
    const g = state(), p = g.people.find(p => p.id === 'parent2')!
    p.since = 50
    expect(compileRequires({ alive: ['parent2'], absent: ['parent2'] })(g)).toBe(true)
    expect(compileRequires({ exists: ['parent2'] })(g)).toBe(false)
    p.since = 0; p.alive = false
    expect(compileRequires({ exists: ['parent2'], dead: ['parent2'], absent: ['parent2'] })(g)).toBe(true)
    expect(compileRequires({ alive: ['parent2'] })(g)).toBe(false)
  })
  it('does not read explicitly positional legacy choices', () => {
    const g = state(); g.decisions = [{ id: 'archive-help', choice: 'legacy-index:0', age: 20, legacy: true }]
    expect(compileRequires({ chose: { 'archive-help': ['legacy-index:0'] } })(g)).toBe(false)
  })
  it('legacy event ages remain usable without treating positions as stable choices', () => {
    const g = state(); g.decisions = [{ id: 'archive-help', choice: 'legacy-index:0', age: 20, legacy: true }]
    expect(compileRequires({ decisionYears: { 'archive-help': { min: 25, max: 25 } } })(g)).toBe(true)
  })
  it('exposes decision deadlines to the existing director, including active OR branches', () => {
    const g = state()
    const r: Requires = { chose: { 'archive-help': ['help'] }, decisionYears: { 'archive-help': { min: 20, max: 25 } } }
    expect(compileExpiry(r)!(g)).toBe(0)
    expect(compileExpiry({ any: [r, { chose: { 'archive-help': ['refuse'] }, decisionYears: { 'archive-help': { max: 40 } } }] })!(g)).toBe(0)
    expect(compileExpiry({ any: [r, { seen: ['archive-help'] }] })!(g)).toBe(Infinity)
  })
  it('bounds compiler recursion', () => {
    let r: Requires = {}; for (let i = 0; i < 10; i++) r = { any: [r] }
    expect(() => compileRequires(r)).toThrow('depth')
    const items = json(); items[1]!.requires = r
    expect(errors(items).some(i => i.message.includes('глубина'))).toBe(true)
    expect(() => compileStorylet(items[1]!)).toThrow('depth')
  })
})

describe('v2 compiler vertical slice: one JSON situation, three actual pasts', () => {
  it('validates the complete fixture', () => expect(errors()).toEqual([]))
  it.each(['help', 'refuse', 'unseen'])('past %s changes body, answers, result and effects', past => {
    const [, event] = install(), g = state()
    if (past === 'unseen') { g.decisions = []; g.seen = [] } else g.decisions[0]!.choice = past
    expect(storyBody(g, event!)).toBe(past === 'unseen' ? event!.body : event!.bodyVariants![past === 'help' ? 0 : 1]!.text)
    expect(visibleChoiceIndices(g)).toEqual(past === 'help' ? [0, 2] : past === 'refuse' ? [1, 2] : [2])
    const next = decide(g, 2), log = next.history.find(h => h.kind === 'choice')!
    expect(log.text).toBe(resolveText(g, past === 'unseen' ? event!.choices[2]!.result : event!.choices[2]!.resultVariants![past === 'help' ? 0 : 1]!.text))
    const branch = decide(g, visibleChoiceIndices(g)[0]!)
    expect(branch.flags.archiveReunion).toBe(past === 'help' ? 'shared' : past === 'refuse' ? 'reconciled' : 'listened')
    expect(next.rng).toBe(g.rng)
  })
  it('uses first match, fallback and no RNG', () => {
    const g = state(), variants = [{ available: () => true, text: 'first' }, { available: () => true, text: 'second' }]
    expect(variantText(g, 'base', variants)).toBe('first')
    expect(variantText(g, 'base', [{ ...variants[0]!, available: () => false }])).toBe('base')
  })
  it('freezes result conditions before its own flag effects', () => {
    const items = json(); items[1]!.choices[2]!.resultVariants = [{ requires: { flagNot: ['archiveReunion'] }, text: 'Это первая встреча у витрины за много лет.' }]
    install(items); const g = state(), next = decide(g, 2)
    expect(next.flags.archiveReunion).toBe('listened')
    expect(next.history.find(h => h.kind === 'choice')!.text).toBe('Это первая встреча у витрины за много лет.')
  })
  it('records stable choices exactly once and survives reordering and loading', () => {
    const [first] = install(), g = state(); g.decisions = []; g.pending = first!.id
    const next = decide(g, 0)
    expect(next.decisions).toEqual([{ id: 'archive-help', choice: 'help', age: 45, epilogue: resolveText(g, first!.choices[0]!.epilogue!) }])
    expect(decide(next, 0)).toBe(next)
    first!.choices.reverse()
    expect(compileRequires({ chose: { 'archive-help': ['help'] } })(next)).toBe(true)
    const loaded = repairSave(JSON.parse(JSON.stringify(next))).game
    expect(repairSave(loaded).game).toEqual(loaded)
    expect(loaded.decisions).toEqual(next.decisions)
  })
  it('semantic calls and audit policies keep the same answer after reordering', () => {
    const [first] = install(), g = state(); g.pending = first!.id; g.decisions = []
    const policyId = first!.choices[storyChoiceIndex(g.seed, first!, g.age)]!.id
    first!.choices.reverse()
    expect(first!.choices[storyChoiceIndex(g.seed, first!, g.age)]!.id).toBe(policyId)
    const next = decideById(g, 'help')
    expect(next.decisions.at(-1)!.choice).toBe('help')
    expect(decideById(g, 'unknown')).toBe(g)
    expect(decide({ ...next, pending: first!.id }, 0).decisions).toEqual(next.decisions)
  })
  it('epilogue freezes the actual name and grammar at acceptance', () => {
    const items = json(); items[1]!.choices[2]!.epilogue = 'Сохранил{{hero:|а}} рассказ: {{parent2}}.'
    items[1]!.choices[2]!.requires = { present: ['parent2'] }
    install(items); const g = state(); g.protagonist.gender = 'f'
    const next = decide(g, 2), fact = next.decisions.at(-1)!.epilogue!
    expect(fact).toContain('Сохранила'); expect(fact).not.toContain('{{')
    next.people.find(p => p.id === 'parent2')!.name = 'Другое имя'
    next.people.find(p => p.id === 'parent2')!.alive = false
    expect(repairSave(next).game.decisions.at(-1)!.epilogue).toBe(fact)
  })
  it('denies direct hidden calls and never records unaffordable choices', () => {
    const [, event] = install(), g = state()
    expect(canChoose(g, 1).available).toBe(false); expect(decide(g, 1)).toBe(g)
    event!.choices[0]!.effects.money = -1001
    expect(visibleChoiceIndices(g)).toEqual([0, 2]); expect(canChoose(g, 0).reason).toContain('Не хватает')
    expect(decide(g, 0)).toBe(g); expect(g.decisions).toHaveLength(1)
  })
  it('does not list impossible hidden answers as other paths in a fork', () => {
    const [, event] = install(), g = state(); event!.arc = 'archive'; event!.fork = true
    const next = decide(g, 2)
    expect(next.forks.at(-1)!.others).toEqual(['Вспомнить тот вечер'])
  })
  it('uses explicit tone and preserves legacy tone overrides', () => {
    const [, event] = install(); expect(toneOf(event!)).toBe('warm')
    expect(toneOf({ ...event!, id: 'parent-illness', tone: undefined })).toBe('crisis')
  })
  it('drops a dynamic dead end with no money, time, RNG, fork or decision effect', () => {
    const [, event] = install(), g = state()
    event!.choices.forEach(c => { c.available = () => false })
    const next = dropUnanswerablePending(g)
    expect(next.pending).toBeNull(); expect(next.decisions).toEqual(g.decisions)
    expect(next.rng).toBe(g.rng); expect(next.economy).toEqual(g.economy); expect(next.attention).toBe(g.attention)
    expect(repairSave(g).game.pending).toBeNull()
    expect(tick(g).age).toBe(g.age + 1)
  })
})

describe('v2 people references and moments', () => {
  it.each(['parent2', 'sibling'])('guards %s in active body and substitutes name and gender', id => {
    const g = state(), event = install()[1]!
    const p = g.people.find(p => p.id === id)
    if (!p) g.people.push({ id, name: 'Лея', role: 'Родственница', gender: 'f', age: 40, alive: true, since: 0, bond: 50 })
    event.bodyVariants = undefined
    event.body = `{{${id}}} говорит: {{${id}:он|она}} здесь.`
    g.pending = null; g.seen = storylets.filter(s => s.id !== event.id).map(s => s.id)
    expect(resolveText(g, event.body)).not.toContain('{{')
    g.people.find(p => p.id === id)!.alive = false
    // The active text guard, independent of a second person-specific variant.
    const next = tick(g); expect(next.pending).not.toBe(event.id)
  })
  it('an unavailable variant never hides the entire scene', () => {
    const items = json(); items[1]!.bodyVariants = [{ requires: { present: ['child'] }, text: 'У витрины {{child}} долго рассматривает старую коробку, потом задаёт вопрос о её истории.' }]
    const event = install(items)[1]!, g = state()
    expect(storyBody(g, event)).toBe(event.body)
  })
  it('explicit dead guard permits a historical name', () => {
    const items = json(); items[1]!.bodyVariants = [{ requires: { dead: ['parent2'] }, text: 'В архивной записи {{parent2}} говорит о молодости. Ты узнаёшь голос, которого уже не слышишь дома.' }]
    const event = install(items)[1]!, g = state(); g.people.find(p => p.id === 'parent2')!.alive = false
    expect(storyBody(g, event)).toContain('{{parent2}}')
    expect(errors(items)).toEqual([])
  })
  it('permits a historical name in a choice with its own dead guard', () => {
    const items = json(); items[1]!.choices[0]!.requires = { dead: ['parent2'] }
    items[1]!.choices[0]!.text = 'Вспомнить {{parent2}}'
    install(items); const g = state(); g.people.find(p => p.id === 'parent2')!.alive = false
    expect(visibleChoiceIndices(g)).toContain(0); expect(canChoose(g, 0).available).toBe(true)
    expect(decide(g, 0).decisions.at(-1)!.choice).toBe('remember')
  })
  it('moment text and result use alternatives before effects', () => {
    const m = compileMoment({ id: 'm-v2-probe', title: 'Коробка', text: 'В коридоре тихо стоит старая коробка.', textVariants: [{ requires: { chose: { 'archive-help': ['help'] } }, text: 'Ты узнаёшь старую коробку в коридоре.' }],
      spot: 'door', min: 18, max: 80, weight: 1, cooldown: null,
      accept: { label: 'Прочитать', result: 'Запись заканчивается знакомым голосом.', resultVariants: [{ requires: { flagNot: ['archiveReunion'] }, text: 'Этот голос впервые за много лет звучит рядом.' }], effects: { flags: { archiveReunion: true } } }, skip: { label: 'Пройти мимо' } })
    moments.push(m); const g = state(); g.pending = null; g.moment = m.id
    expect(eligibleMoments(g)).toContain(m)
    expect(variantText(g, m.text, m.textVariants)).toContain('узнаёшь')
    const next = takeMoment(g); expect(next.history[0]!.text).toBe('Этот голос впервые за много лет звучит рядом.')
    expect(next.rng).toBe(g.rng); expect(next.attention).toBe(g.attention - 1)
  })
})

describe('v2 validation and migrations', () => {
  const invalid: unknown[] = [
    { any: [] }, { any: [null] }, { any: 'no' }, { typo: true }, { seen: ['unknown'] }, { notSeen: [0] },
    { chose: { unknown: ['help'] } }, { chose: { 'archive-help': ['unknown'] } }, { chose: { 'archive-help': [0] } },
    { chose: {} }, { decisionYears: { unknown: { min: 2 } } }, { decisionYears: { 'archive-help': { min: -1 } } },
    { bond: { ghost: { min: 1 } } }, { bond: { parent: { min: 51, max: 50 } } }, { bond: { parent: {} } },
    { ship: { ghost: { min: 1 } } }, { skill: { ghost: { max: 2 } } }, { skill: { social: { min: 0.5 } } },
    { birthWealth: { min: 0 } }, { birthWealth: { max: 6 } }, { trait: ['unknown'] },
    { dead: ['ghost'] }, { absent: [false] }, { exists: 'parent' }
  ]
  it.each(invalid)('rejects malformed/unknown condition %j', requires => {
    const items = json(); (items[1] as unknown as { requires: unknown }).requires = requires
    expect(errors(items).length).toBeGreaterThan(0)
  })
  it('rejects duplicate and missing choice IDs and missing unconditional exit', () => {
    const items = json(); items[0]!.choices[1]!.id = 'help'; expect(errors(items).some(i => i.message.includes('повторяющийся'))).toBe(true)
    delete items[0]!.choices[1]!.id; expect(errors(items).some(i => i.message.includes('стабильный ID'))).toBe(true)
    items[1]!.choices[2]!.requires = { seen: ['archive-help'] }
    expect(errors(items).some(i => i.message.includes('безусловный'))).toBe(true)
  })
  it('validates guards of the specific variant, including every OR branch', () => {
    const items = json(); items[1]!.bodyVariants = [{ requires: { any: [{ present: ['child'] }, { absent: ['child'] }] }, text: '{{child}} спрашивает о старой коробке. Ты отвечаешь и показываешь снимок из архива.' }]
    expect(errors(items).some(i => i.message.includes('не гарантирован'))).toBe(true)
  })
  it('keeps economy, time, flags and old forks while adding an empty legacy journal', () => {
    const g = state(); delete (g as Partial<typeof g>).decisions
    const repaired = repairSave(g).game
    expect(repaired.decisions).toEqual([]); expect(repaired.economy).toEqual(g.economy)
    expect(repaired.timeYear).toEqual(g.timeYear); expect(repaired.flags).toEqual(g.flags)
    expect(repairSave(repaired).game).toEqual(repaired)
  })
  it('discards invalid, future and duplicate records without inventing facts', () => {
    const records = [{ id: 'removed-story', choice: 'old-choice', age: 10, epilogue: 'Старый факт.' }, { id: 'future', choice: 'help', age: 100 }, { id: 'removed-story', choice: 'other', age: 11 }, { id: 'broken', choice: 1, age: 12 }]
    expect(repairDecisions(records, 20)).toEqual([records[0]])
    const g = createGame(1); g.decisions = records as never
    expect(findInconsistencies(g).some(s => s.includes('журнал'))).toBe(true)
  })
  it('validates declarative line start and category registry', () => {
    const items = json(); items[0]!.arc = 'archive'; items[0]!.fork = true; items[1]!.arc = 'archive'
    const files = [{ path: 'test.json', kind: 'storylets' as const, data: items }]
    expect(validateRegistrations([{ id: 'archive', title: 'Архив', start: 'archive-help' }], [{ id: 'Архив', title: 'Архив' }], files, known())).toEqual([])
    expect(validateRegistrations([{ id: 'archive', title: 'Архив', start: 'missing' }], [], files, known()).length).toBeGreaterThan(0)
    expect(validateRegistrations({}, [], files, known()).length).toBeGreaterThan(0)
  })
  it.each(['help', 'refuse'])('starts and continues a completely new JSON arc after %s and reload', answer => {
    const items = json(), lines = [{ id: 'archive', title: 'Архив', start: 'archive-help' }]
    const categories = [{ id: 'archives', title: 'Архивы' }]
    items[0]!.arc = 'archive'; items[0]!.fork = true; items[0]!.category = 'archives'
    items[1]!.arc = 'archive'; items[1]!.category = 'archives'; items[1]!.priority = 'followup'
    items[1]!.requires = { seen: ['archive-help'], decisionYears: { 'archive-help': { min: 20 } } }
    const files = [{ path: 'new-line.json', kind: 'storylets' as const, data: items }]
    const registry = collectKnown(codeStorylets, codeMoments, lines, categories)
    expect(validateContent(files, registry).filter(i => i.level === 'error')).toEqual([])
    expect(validateRegistrations(lines, categories, files, registry)).toEqual([])
    install(items)
    let g = state(); g.age = 20; g.pending = 'archive-help'; g.decisions = []; g.seen = ['archive-help']
    g = decideById(g, answer)
    expect(g.forks.at(-1)!.arc).toBe('archive')
    g = repairSave(JSON.parse(JSON.stringify(g))).game
    g.age = 40; g.pending = 'archive-return'; g.seen.push('archive-return')
    g = decideById(g, answer === 'help' ? 'remember' : 'apologize')
    expect(g.forks.at(-1)!.outcomes).toHaveLength(1)
    expect(g.flags.archiveReunion).toBe(answer === 'help' ? 'shared' : 'reconciled')
    expect(repairSave(g).game.forks).toEqual(g.forks)
  })
})
