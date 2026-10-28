import { describe, expect, it } from 'vitest'
import bundle from '../../content/bundle.json'
import { compileRequires } from '../../content/load'
import { collectKnown, validateContent } from '../../content/validate'
import { partnerSector, residenceOf } from '../birth'
import { beatAt, runClock } from '../clock'
import { advanceYear, beat, createGame, decide, eligibleMoments, skipMoment, takeMoment, tick } from '../engine'
import { findInconsistencies } from '../invariants'
import { codeMoments, moments } from '../moments'
import { repairSave } from '../save'
import { codeStorylets, storylets } from '../storylets'
import type { GameState, SectorId, Storylet } from '../types'

/** Взрослый герой в середине жизни: все люди на месте, внимание на год полное. */
function base(seed = 5): GameState {
  const g = createGame(seed)
  g.age = 30
  g.shipYear = 220
  g.attention = 3
  g.people.forEach(p => { p.alive = true })
  return g
}

const withFlags = (g: GameState, flags: GameState['flags']) => ({ ...g, flags: { ...g.flags, ...flags } })
const eligibleIds = (g: GameState) => eligibleMoments(g).map(m => m.id)
const story = (id: string) => storylets.find(s => s.id === id)!
const ask = (g: GameState, id: string, choice: number) => decide({ ...g, pending: id }, choice)

/** Проживает жизнь до конца: решения по `pick`, моменты по желанию принимаются. */
function play(start: GameState, pick: (ev: Storylet, step: number) => number, each?: (g: GameState) => void, accept = false) {
  let g = start
  for (let step = 0; step < 600 && !g.stopped; step++) {
    if (g.pending) {
      g = decide(g, pick(story(g.pending), step))
    } else {
      while (!g.stopped && !g.pending && g.phase < 3) {
        g = beat(g)
        if (accept && g.moment) g = takeMoment(g)
        each?.(g)
      }
      g = tick(g)
    }
    each?.(g)
  }
  return g
}

describe('закрытие моментов: последствия отказа ровно один раз', () => {
  // m-call-parent: отказ стоит одной единицы связей, принятие связи героя не трогает
  const withMoment = (phase: 0 | 1 | 2 | 3) => {
    const g = base()
    g.phase = phase
    g.moment = 'm-call-parent'
    g.momentLog['m-call-parent'] = g.age
    const baseline = structuredClone(g)
    baseline.moment = null
    return { g, baseline }
  }
  const phases = [0, 1, 2, 3] as const

  it('skipMoment применяет отказ один раз', () => {
    for (const phase of phases) {
      const { g, baseline } = withMoment(phase)
      const skipped = skipMoment(g)
      expect(skipped.moment).toBeNull()
      expect(skipped.stats.bonds - baseline.stats.bonds).toBeCloseTo(-1)
      expect(skipMoment(skipped)).toBe(skipped)
    }
  })

  it('отметка года закрывает прошлый момент с последствиями', () => {
    for (const phase of [0, 1, 2] as const) {
      const { g, baseline } = withMoment(phase)
      expect(beat(g).stats.bonds - beat(baseline).stats.bonds).toBeCloseTo(-1)
    }
  })

  it('смена года закрывает момент последней отметки с последствиями', () => {
    for (const phase of phases) {
      const { g, baseline } = withMoment(phase)
      const next = tick(g)
      expect(next.moment).toBeNull()
      expect(next.stats.bonds - tick(baseline).stats.bonds).toBeCloseTo(-1)
    }
  })

  it('быстрое прохождение года (advanceYear) из любой фазы', () => {
    for (const phase of phases) {
      const { g, baseline } = withMoment(phase)
      expect(advanceYear(g).stats.bonds - advanceYear(baseline).stats.bonds).toBeCloseTo(-1)
    }
  })

  it('принятие момента не добавляет отказ ни сразу, ни при смене года', () => {
    for (const phase of phases) {
      const { g, baseline } = withMoment(phase)
      const taken = takeMoment(g)
      expect(taken.moment).toBeNull()
      expect(advanceYear(taken).stats.bonds).toBeCloseTo(advanceYear(baseline).stats.bonds)
    }
  })

  it('на любой скорости часов результат один и тот же', () => {
    const SECONDS_PER_YEAR = 22
    for (const phase of phases) {
      for (const speed of [.5, 1, 2, 4, 8, 16]) {
        const run = (start: GameState) => {
          let g = start
          let progress = beatAt(phase)
          for (let i = 0; i < 20000 && g.age === start.age && !g.stopped && !g.pending; i++) {
            const r = runClock(g, progress, .05, speed, SECONDS_PER_YEAR)
            g = r.game
            progress = r.progress
          }
          return g
        }
        const { g, baseline } = withMoment(phase)
        const a = run(g)
        const b = run(baseline)
        expect(a.age, `фаза ${phase}, скорость ${speed}`).toBe(g.age + 1)
        expect(a.stats.bonds - b.stats.bonds, `фаза ${phase}, скорость ${speed}`).toBeCloseTo(-1)
        expect(a.moment).toBe(b.moment)
      }
    }
  })

  it('advanceYear даёт то же состояние, что отметки и смена года по очереди', () => {
    const { g } = withMoment(1)
    let manual = g
    while (!manual.pending && manual.phase < 3) manual = beat(manual)
    manual = tick(manual)
    expect(advanceYear(g)).toEqual(manual)
  })
})

describe('партнёр: жильё, стадия отношений и присутствие', () => {
  const together = () => withFlags(base(), { lovePath: 'confessed', loveStage: 'together', loveStageAge: 25, livingTogether: true })

  it('вечер вдвоём не появляется, когда партнёра нет в живых', () => {
    const g = together()
    expect(eligibleIds(g)).toContain('m-partner')
    g.people.find(p => p.id === 'friend')!.alive = false
    expect(eligibleIds(g)).not.toContain('m-partner')
  })

  it('смерть партнёра снимает совместную жизнь', () => {
    const g = together()
    g.people.find(p => p.id === 'friend')!.age = 110
    const next = tick(g)
    expect(next.people.find(p => p.id === 'friend')!.alive).toBe(false)
    expect(next.flags.livingTogether).toBe(false)
    expect(findInconsistencies(next)).toEqual([])
  })

  it('«пожить врозь» заканчивает совместную жизнь и закрывает вечера вдвоём', () => {
    const apart = ask(together(), 'love-home-offer', 2)
    expect(apart.flags.loveStage).toBe('apart')
    expect(apart.flags.livingTogether).toBe(false)
    expect(eligibleIds(apart)).not.toContain('m-partner')
    expect(findInconsistencies(apart)).toEqual([])
  })

  it('«переехать вместе» меняет место жительства, а совместная жизнь остаётся', () => {
    const g = together()
    const moved = ask(g, 'love-home-offer', 0)
    expect(residenceOf(moved)).toBe(partnerSector(g))
    expect(residenceOf(moved)).not.toBe(residenceOf(g))
    expect(moved.flags.livingTogether).toBe(true)
    expect(moved.history.some(h => h.title === 'Переезд')).toBe(true)
    expect(findInconsistencies(moved)).toEqual([])
  })

  it('сектор партнёра всегда отличается от нынешнего дома и не зависит от RNG', () => {
    const sectors: SectorId[] = ['atrium', 'bio', 'engineering', 'clinic', 'lower']
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame(seed)
      for (const residence of sectors) {
        const probe = { ...g, residence }
        expect(partnerSector(probe)).not.toBe(residence)
        expect(partnerSector(probe)).toBe(partnerSector({ ...probe }))
      }
    }
  })

  it('после года врозь есть выход: вернуться, оставить как есть или расстаться', () => {
    const apart = ask(together(), 'love-home-offer', 2)
    const later = { ...apart, age: apart.age + 1 }
    expect(story('love-apart-return').available(later)).toBe(true)
    expect(story('love-apart-return').available(apart)).toBe(false)
    const back = ask(later, 'love-apart-return', 0)
    expect(back.flags).toMatchObject({ loveStage: 'reunited', livingTogether: true })
    expect(findInconsistencies(back)).toEqual([])
    for (const [choice, stage] of [[1, 'open'], [2, 'parted']] as const) {
      const g = ask(later, 'love-apart-return', choice)
      expect(g.flags).toMatchObject({ loveStage: stage, livingTogether: false })
    }
  })
})

describe('устаревшие напоминания о переезде', () => {
  const applied = () => withFlags(base(), { adultMovePlan: 'applied', adultMovePlanAge: 25 })

  it('ответ по каюте приходит, пока герой ещё не переехал', () => {
    const g = applied()
    g.residence = 'lower'
    expect(eligibleIds(g)).toContain('m-adult-move-applied')
  })

  it('и не приходит после переезда или отказа от него', () => {
    const moved = withFlags(applied(), { familyMove: 'moved' })
    moved.residence = 'bio'
    expect(eligibleIds(moved)).not.toContain('m-adult-move-applied')
    const stayed = withFlags(applied(), { familyMove: 'stayed' })
    stayed.residence = 'lower'
    expect(eligibleIds(stayed)).not.toContain('m-adult-move-applied')
  })

  it('заявка на место у биокупола не предлагается тому, кто там уже живёт', () => {
    const g = base()
    g.residence = 'bio'
    expect(story('adult-sector-move').available(g)).toBe(false)
    g.residence = 'lower'
    expect(story('adult-sector-move').available(g)).toBe(true)
  })

  it('письмо клиники не приходит после решения о ребёнке', () => {
    const g = withFlags(base(), { adultFamilyPlan: 'applied', adultFamilyPlanAge: 25 })
    expect(eligibleIds(g)).toContain('m-adult-family-applied')
    expect(eligibleIds(withFlags(g, { familyChild: 'declined', familyChildAge: 27 }))).not.toContain('m-adult-family-applied')
  })
})

describe('отложенные решения о родительстве имеют продолжение', () => {
  const deferred = (planAge = 28) => withFlags(base(), { adultFamilyPlan: 'deferred', adultFamilyPlanAge: planAge })
  const waiting = (childAge = 28) => withFlags(base(), { adultFamilyPlan: 'applied', adultFamilyPlanAge: 26, familyChild: 'waiting', familyChildAge: childAge })

  it('«отложить» возвращается через несколько лет, не раньше', () => {
    const again = story('adult-family-return')
    expect(again.available({ ...deferred(), age: 31 })).toBe(false)
    expect(again.available({ ...deferred(), age: 32 })).toBe(true)
    expect(again.available({ ...deferred(), age: 43 })).toBe(true)
    expect(again.available({ ...deferred(), age: 44 })).toBe(false)
  })

  it('возвращённый вопрос нельзя отложить ещё раз', () => {
    const again = story('adult-family-return')
    const g = { ...deferred(), age: 33 }
    again.choices.forEach((_, i) => {
      const next = ask(g, again.id, i)
      expect(next.flags.adultFamilyPlan).not.toBe('deferred')
      expect(again.available({ ...next, age: 40 })).toBe(false)
    })
  })

  it('заявка после возврата ведёт к полноценному выбору, отказ закрывает тему', () => {
    const g = { ...deferred(), age: 33 }
    const applied = ask(g, 'adult-family-return', 0)
    expect(applied.flags.adultFamilyPlan).toBe('applied')
    expect(story('family-a-life-ahead').available({ ...applied, age: applied.age + 1 })).toBe(true)
    const declined = ask(g, 'adult-family-return', 1)
    expect(declined.flags.adultFamilyPlan).toBe('declined')
    expect(story('family-a-life-ahead').available({ ...declined, age: declined.age + 3 })).toBe(false)
  })

  it('«дать себе время» возвращается один раз с возможностью отказаться или согласиться', () => {
    const again = story('family-life-ahead-again')
    expect(again.available({ ...waiting(), age: 30 })).toBe(false)
    expect(again.available({ ...waiting(), age: 44 })).toBe(false)
    const g = { ...waiting(), age: 32 }
    expect(again.available(g)).toBe(true)
    expect(again.available({ ...g, flags: { ...g.flags, familyChild: 'born' } })).toBe(false)
    const born = ask(g, again.id, 0)
    expect(born.people.some(p => p.id === 'child')).toBe(true)
    expect(born.flags).toMatchObject({ familyChild: 'born', familyChildAge: 32 })
    expect(findInconsistencies(born)).toEqual([])
    expect(ask(g, again.id, 1).flags.familyChild).toBe('declined')
    const lapsed = ask(g, again.id, 2)
    expect(lapsed.flags.familyChild).toBe('lapsed')
    expect(again.available({ ...lapsed, age: 40 })).toBe(false)
  })

  it('каждый «временный» флаг сюжетов из JSON имеет продолжение, которое его меняет', () => {
    const temporary = ['deferred', 'waiting']
    type Raw = { id: string; requires?: { flagIs?: Record<string, unknown> }; choices: { effects: { flags?: Record<string, unknown> } }[] }
    const raw = bundle.storylets as unknown as Raw[]
    const written = raw.flatMap(s => s.choices.flatMap(c => Object.entries(c.effects.flags ?? {}).filter(([, v]) => temporary.includes(String(v))).map(([k, v]) => [s.id, k, String(v)] as const)))
    expect(written.length).toBeGreaterThan(0)
    for (const [from, key, value] of written) {
      const follow = raw.filter(s => s.id !== from && [s.requires?.flagIs?.[key]].flat().map(String).includes(value))
      expect(follow.length, `${from}: «${key}=${value}» некому продолжить`).toBeGreaterThan(0)
      for (const s of follow) {
        for (const c of s.choices) expect(c.effects.flags?.[key], `${s.id} оставляет «${key}=${value}»`).toBeDefined()
        for (const c of s.choices) expect(String(c.effects.flags?.[key]), `${s.id}: продолжение снова откладывает`).not.toBe(value)
      }
    }
  })

  it('в живых жизнях отложенный вопрос возвращается и не повторяется', () => {
    let returned = 0
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1)
    for (const seed of seeds) {
      const g = withFlags(createGame(seed), { adultFamilyPlan: 'deferred', adultFamilyPlanAge: 26 })
      g.age = 28
      const end = play(g, () => 0)
      expect(end.seen.filter(id => id === 'adult-family-return').length).toBeLessThanOrEqual(1)
      if (end.seen.includes('adult-family-return')) returned++
    }
    expect(returned).toBeGreaterThanOrEqual(seeds.length / 2)
  })
})

describe('детские сцены привязаны к возрасту ребёнка', () => {
  const childMoments = moments.filter(m => m.needs?.includes('child'))
  const parentWithChild = (childAge: number, answer: string) => {
    const g = withFlags(base(), { familyChild: 'born', familyChildAge: 20, familyAnswer: answer, familyAnswerAge: 20, adultFamilyPlan: 'applied' })
    g.age = 20 + childAge + 4
    g.people.push({ id: 'child', name: 'Ким Орлов', gender: 'm', role: 'Сын', bond: 70, age: childAge, alive: true, since: g.age - childAge })
    g.flags.familyChildAge = g.age - childAge
    g.flags.familyAnswerAge = g.age - Math.min(childAge, 4)
    return g
  }
  const answers = ['honest', 'hopeful', 'diverted']
  const idsAt = (childAge: number) => new Set(answers.flatMap(a => eligibleIds(parentWithChild(childAge, a)).filter(id => childMoments.some(m => m.id === id))))

  it('у взрослого ребёнка нет детских сцен', () => {
    for (const age of [18, 25, 40]) expect([...idsAt(age)], `ребёнку ${age}`).toEqual([])
  })

  it('каждая детская сцена достижима в каком-то возрасте ребёнка', () => {
    const reachable = new Set<string>()
    for (let age = 0; age <= 17; age++) idsAt(age).forEach(id => reachable.add(id))
    for (const m of childMoments) expect(reachable.has(m.id), m.id).toBe(true)
  })

  it('сцена со свёртком — для школьника, не для младенца', () => {
    expect(idsAt(1).has('m-family-child-door')).toBe(false)
    expect(idsAt(10).has('m-family-child-door')).toBe(true)
    expect(idsAt(30).has('m-family-child-door')).toBe(false)
  })

  it('валидатор требует возрастного окна для момента с ребёнком', () => {
    const known = collectKnown(codeStorylets, codeMoments)
    const all = structuredClone(bundle.moments) as unknown as Record<string, unknown>[]
    const check = () => validateContent([{ path: 's.json', kind: 'storylets', data: bundle.storylets }, { path: 'm.json', kind: 'moments', data: all }], known)
      .filter(i => i.level === 'error').map(i => i.where + ' ' + i.message).join('\n')
    expect(check()).toBe('')
    const door = all.find(m => m.id === 'm-family-child-door')!
    delete (door.requires as Record<string, unknown>).personAge
    expect(check()).toContain('personAge.child')
  })
})

describe('personAge и present', () => {
  it('personAge не проверяет, жив ли человек, а present проверяет', () => {
    const g = base()
    const parent = g.people.find(p => p.id === 'parent')!
    parent.age = 80
    parent.alive = false
    expect(compileRequires({ personAge: { parent: { min: 75 } } })(g)).toBe(true)
    expect(compileRequires({ personAge: { parent: { min: 75 } }, present: ['parent'] })(g)).toBe(false)
    parent.alive = true
    expect(compileRequires({ personAge: { parent: { min: 75 } }, present: ['parent'] })(g)).toBe(true)
  })

  it('present не пропускает человека, который ещё не появился', () => {
    const g = base()
    g.age = 10
    expect(compileRequires({ present: ['mentor'] })(g)).toBe(false)
    g.age = 20
    expect(compileRequires({ present: ['mentor'] })(g)).toBe(true)
  })
})

describe('сохранения и изменения каталога', () => {
  it('удалённое решение снимается, остальная жизнь сохраняется', () => {
    const g = base()
    g.memories.push('Что-то важное.')
    g.pending = 'storylet-which-was-removed'
    const { game, notes } = repairSave(g)
    expect(game.pending).toBeNull()
    expect(notes.join(' ')).toContain('storylet-which-was-removed')
    expect(game.age).toBe(g.age)
    expect(game.memories).toEqual(g.memories)
    expect(game.history[0]!.title).toBe('Старая запись')
    expect(advanceYear(game).age).toBe(g.age + 1)
  })

  it('удалённый момент снимается', () => {
    const g = base()
    g.moment = 'm-which-was-removed'
    const { game, notes } = repairSave(g)
    expect(game.moment).toBeNull()
    expect(notes.length).toBe(1)
    expect(findInconsistencies(game)).toEqual([])
  })

  it('исправная и старая «жизнь вдвоём без стадии» согласуются', () => {
    const fine = base()
    expect(repairSave(fine)).toEqual({ game: fine, notes: [] })
    const legacy = withFlags(base(), { livingTogether: true, loveStage: 'apart' })
    const { game } = repairSave(legacy)
    expect(game.flags.livingTogether).toBe(false)
    const dead = withFlags(base(), { livingTogether: true, loveStage: 'together' })
    dead.people.find(p => p.id === 'friend')!.alive = false
    expect(repairSave(dead).game.flags.livingTogether).toBe(false)
  })

  it('decide на пропавшее решение не блокирует игру', () => {
    const g = { ...base(), pending: 'storylet-which-was-removed' }
    const next = decide(g, 0)
    expect(next.pending).toBeNull()
    expect(advanceYear(next).age).toBe(g.age + 1)
  })
})

describe('инварианты мира и детерминизм', () => {
  /** Герой в начале взрослой жизни с «любовной» линией: так в прогон попадают переезды, расставания и смерть партнёра. */
  const loveLife = (seed: number) => {
    const g = withFlags(createGame(seed), { lovePath: 'confessed', loveStage: 'together', loveStageAge: 28, livingTogether: true })
    g.age = 29
    g.shipYear += 29
    g.people.find(p => p.id === 'friend')!.age = 66 + (seed % 6)
    return g
  }
  const cycling = (ev: Storylet, step: number) => step % ev.choices.length

  it('в жизнях нет невозможных состояний', () => {
    for (let seed = 1; seed <= 14; seed++) {
      const problems = new Set<string>()
      const g = seed % 2 ? loveLife(seed) : createGame(seed)
      play(g, (ev, step) => cycling(ev, step + seed), s => findInconsistencies(s).forEach(p => problems.add(`${seed}: ${p}`)), true)
      expect([...problems]).toEqual([])
    }
  }, 120000)

  it('один seed и одни действия дают один результат', () => {
    for (const seed of [3, 4, 9]) {
      const run = () => play(loveLife(seed), (ev, step) => cycling(ev, step + seed), undefined, true)
      expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
    }
  }, 60000)
})
