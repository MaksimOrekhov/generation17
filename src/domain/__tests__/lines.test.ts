import { describe, expect, it } from 'vitest'
import { advanceYear, createGame, decide } from '../engine'
import { storylets } from '../storylets'
import type { GameState } from '../types'

function ready(g: GameState, arc: string) {
  return storylets
    .filter(s => s.arc === arc && !s.fork && g.age >= s.min && g.age <= s.max && !g.seen.includes(s.id) && s.available(g))
    .map(s => s.id)
}

function state(age: number, flags: GameState['flags']): GameState {
  const g = createGame(4)
  g.age = age
  g.flags = { ...flags }
  g.people.forEach(p => { p.alive = true; p.bond = 60 })
  return g
}

type Case = [string, number, GameState['flags'], string[]]

const signal: Case[] = [
  ['исследовал', 35, { signalInvestigated: 25 }, ['signal-result']],
  ['обсуждал с друзьями', 35, { heardSignal: true, signalAge: 25 }, ['signal-rumor-circle']],
  ['проигнорировал', 40, { ignoredSignal: true, signalAge: 25 }, ['signal-ignored-echo']],
  ['опубликовал', 40, { signalClosed: true, signalStage: 'published', signalStageAge: 30 }, ['signal-public-debate']],
  ['выступил открыто', 46, { signalStage: 'debated-open', signalStageAge: 38 }, ['signal-report']],
  ['работал тихо', 46, { signalStage: 'debated-quiet', signalStageAge: 38 }, []],
  ['отошёл от комиссии', 46, { signalStage: 'withdrew', signalStageAge: 38 }, []],
  ['передал архивариусу', 40, { signalClosed: true, signalStage: 'archived', signalStageAge: 30 }, ['signal-archive-opened']],
  ['сохранил тайну', 42, { signalClosed: true, signalStage: 'secret', signalStageAge: 30 }, ['signal-secret-visitor']],
  ['присоединился к кружку', 40, { heardSignal: true, signalCircle: 'joined', signalStageAge: 30, signalAge: 25 }, ['signal-circle-joined']],
  ['предупредил администрацию', 40, { heardSignal: true, signalCircle: 'warned', signalStageAge: 30, signalAge: 25 }, ['signal-circle-warned']],
  ['остался в стороне', 45, { heardSignal: true, signalCircle: 'out', signalAge: 25 }, []]
]
const parent: Case[] = [
  ['заботился лично', 40, { parentIll: true, parentCare: 'close', parentAge: 30 }, ['parent-illness-followup']],
  ['искал медицинскую помощь', 40, { parentIll: true, parentCare: 'medical', parentAge: 30 }, ['parent-treatment']],
  ['держал дистанцию', 40, { parentIll: true, parentCare: 'distant', parentAge: 30 }, ['parent-letter']],
  ['записал историю', 45, { parentArchive: true, parentStage: 'recorded', parentStageAge: 35 }, ['parent-keepsake']],
  ['отложил встречу', 45, { parentArchive: true, parentStage: 'postponed', parentStageAge: 35 }, ['parent-regret']],
  ['помог молча', 45, { parentArchive: true, parentStage: 'helped', parentStageAge: 35 }, []],
  ['не ответил на письмо', 45, { parentLetter: 'ignored', parentStage: 'silent', parentStageAge: 35 }, ['parent-last-call']],
  ['пришёл на письмо', 45, { parentLetter: 'visited', parentStage: 'reconciled', parentStageAge: 35 }, []]
]
const neighbor: Case[] = [
  ['остался помочь', 40, { neighborFavor: true, neighborHelped: true, neighborPath: 'helped', neighborAge: 25 }, ['neighbor-followup']],
  ['предложил другую помощь', 35, { neighborFavor: true, neighborPath: 'alt', neighborAge: 25 }, ['neighbor-weekend']],
  ['отказал', 35, { neighborFavor: true, neighborPath: 'refused', neighborAge: 25 }, ['neighbor-cold-leak']],
  ['переехал к саду', 45, { neighborPath: 'helped', neighborStage: 'moved', neighborStageAge: 36, neighborAge: 25 }, ['neighbor-kid-moved']],
  ['уступил каюту', 45, { neighborPath: 'helped', neighborStage: 'passed', neighborStageAge: 36, neighborAge: 25 }, ['neighbor-kid-passed']],
  ['остался дома', 45, { neighborPath: 'helped', neighborStage: 'stayed', neighborStageAge: 36, neighborAge: 25 }, ['neighbor-kid-stayed']],
  ['помог в ночь течи', 45, { neighborPath: 'refused', neighborStage: 'reconciled', neighborStageAge: 36 }, ['neighbor-reconcile']],
  ['не вмешался в ночь течи', 45, { neighborPath: 'refused', neighborStage: 'estranged', neighborStageAge: 36 }, []]
]
const love: Case[] = [
  ['признался', 35, { relationshipTalk: true, closeRelationship: true, lovePath: 'confessed', loveAge: 25 }, ['relationship-followup']],
  ['остался другом', 35, { relationshipTalk: true, lovePath: 'friends', loveAge: 25 }, ['love-friends-union']],
  ['сменил тему', 40, { relationshipTalk: true, lovePath: 'skipped', loveAge: 25 }, ['love-missed']],
  ['жить вместе', 40, { lovePath: 'confessed', loveStage: 'together', loveStageAge: 33 }, ['love-home-offer']],
  ['оставить как есть', 42, { lovePath: 'confessed', loveStage: 'open', loveStageAge: 33 }, ['love-drift']],
  ['расстаться', 45, { lovePath: 'confessed', loveStage: 'parted', loveStageAge: 33 }, ['love-parted-meeting']],
  ['пожить врозь', 40, { lovePath: 'confessed', loveStage: 'apart', loveStageAge: 33 }, ['love-apart-return']],
  ['после переезда', 50, { lovePath: 'confessed', loveStage: 'moved-together', loveStageAge: 40 }, []]
]

describe.each([['signal', signal], ['parent', parent], ['neighbor', neighbor], ['love', love]] as const)('линия %s', (arc, cases) => {
  it.each(cases)('%s (%#)', (_name, age, flags, expected) => {
    expect(ready(state(age, flags), arc)).toEqual(expected)
  })
})

describe('ветвление остальных линий', () => {
  it('до наступления срока продолжение не показывается', () => {
    expect(ready(state(27, { neighborPath: 'refused', neighborAge: 25 }), 'neighbor')).toEqual([])
    expect(ready(state(30, { signalInvestigated: 28 }), 'signal')).toEqual([])
  })

  it('умерший родитель не появляется в продолжениях', () => {
    const g = state(45, { parentArchive: true, parentStage: 'recorded', parentStageAge: 35 })
    g.people.find(p => p.id === 'parent')!.alive = false
    expect(ready(g, 'parent')).toEqual([])
  })

  it('у каждой ветки свой текст и своё название', () => {
    for (const cases of [signal, parent, neighbor, love]) {
      const ids = [...new Set(cases.flatMap(c => c[3]))]
      const items = ids.map(id => storylets.find(s => s.id === id)!)
      expect(new Set(items.map(s => s.body)).size).toBe(items.length)
      expect(new Set(items.map(s => s.title)).size).toBe(items.length)
    }
  })

  it('заголовки сюжетов не содержат неподставляемых шаблонов', () => {
    for (const s of storylets) expect(s.title.includes('{{')).toBe(false)
  })

  it('разные первые выборы дают непересекающиеся цепочки последствий в живых жизнях', () => {
    const starters = ['signal', 'parent-illness', 'neighbor-medical', 'relationship']
    const run = (pick: number) => {
      const outcomes: Record<string, Set<string>> = {}
      for (let seed = 1; seed <= 90; seed++) {
        let g = createGame(seed)
        for (let i = 0; i < 400 && !g.stopped; i++) {
          if (g.pending) {
            const ev = storylets.find(s => s.id === g.pending)!
            g = decide(g, starters.includes(ev.id) ? Math.min(pick, ev.choices.length - 1) : 0)
          } else g = advanceYear(g)
        }
        for (const f of g.forks) {
          outcomes[f.arc] ??= new Set()
          f.outcomes.forEach(o => outcomes[f.arc]!.add(o.title))
        }
      }
      return outcomes
    }
    const a = run(0)
    const b = run(2)
    for (const arc of ['signal', 'parent', 'neighbor', 'love']) {
      expect(a[arc]?.size ?? 0, `${arc}: первый вариант без последствий`).toBeGreaterThan(0)
      expect(b[arc]?.size ?? 0, `${arc}: последний вариант без последствий`).toBeGreaterThan(0)
      for (const t of a[arc]!) expect(b[arc]!.has(t), `${arc}: «${t}» в обеих ветках`).toBe(false)
    }
  }, 180000)
})
