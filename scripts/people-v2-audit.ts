/** Paired seeds; policies use actual game choices and never consume the game RNG. */
import { beat, canChoose, createGame, decide, setFocus, tick } from '../src/domain/engine'
import { findInconsistencies } from '../src/domain/invariants'
import { currentPartner } from '../src/domain/people'
import { storylets } from '../src/domain/storylets'
import type { GameState, Storylet } from '../src/domain/types'
import { textSafe } from '../src/content/load'

type Policy = 'family' | 'career' | 'avoid'
const policies: Policy[] = ['family', 'career', 'avoid']
const count = Number(process.argv[2] ?? 200)
if (!Number.isInteger(count) || count < 1 || count > 2000) throw Error('number of seeds must be 1–2000')

function choice(g: GameState, s: Storylet, policy: Policy): number {
  const valid = s.choices.flatMap((_, i) => canChoose(g, i).available ? [i] : [])
  const wanted = valid.find(i => {
    const c = s.choices[i]!, f = c.effects.flags ?? {}
    if (s.id === 'people-new-encounter') return c.id === (policy === 'family' ? 'meet' : 'leave')
    if (s.id === 'people-new-choice') return c.id === (policy === 'family' ? 'romance' : 'friendship')
    if (s.id === 'relationship') return f.lovePath === (policy === 'family' ? 'confessed' : 'friends')
    if (Object.hasOwn(f, 'adultFamilyPlan')) return f.adultFamilyPlan === (policy === 'family' ? 'applied' : 'declined')
    if (Object.hasOwn(f, 'familyChild')) return f.familyChild === (policy === 'family' ? 'born' : 'declined')
    return false
  })
  return wanted ?? valid[0] ?? -1
}

const report: Record<string, unknown> = {}
const problems: Record<string, number> = {}
for (const policy of policies) {
  const totals = { lives: 0, encounterEligible: 0, encountered: 0, met: 0, partner: 0, newPartner: 0, cohabited: 0, child: 0, child15: 0, child26: 0, adultChildEligible: 0, incomplete: 0, unsafePendingBody: 0, violations: 0, duplicates: 0, bytes: 0, people: 0 }
  for (let seed = 7001; seed < 7001 + count; seed++) {
    let g = createGame(seed)
    let eligible = false, adultEligible = false, everPartner = false, everNewPartner = false, everCohabited = false, age15 = false, age26 = false
    for (let step = 0; step < 450 && !g.stopped; step++) {
      if (g.age >= 6) g = setFocus(g, policy === 'career' && g.age >= 16 ? 'work' : policy === 'career' ? 'study' : 'relationships')
      const encounter = storylets.find(s => s.id === 'people-new-encounter')!
      const adult = storylets.find(s => s.id === 'people-child-independence')!
      eligible ||= g.age >= encounter.min && g.age <= encounter.max && encounter.available(g)
      adultEligible ||= g.age >= adult.min && g.age <= adult.max && adult.available(g)
      everPartner ||= !!currentPartner(g)
      everNewPartner ||= currentPartner(g)?.id === 'story-acquaintance'
      everCohabited ||= g.flags.livingTogether === true
      const child = g.people.find(p => p.id === 'child')
      age15 ||= !!child?.alive && child.age >= 15
      age26 ||= !!child?.alive && child.age >= 26
      if (g.pending) {
        const event = storylets.find(s => s.id === g.pending)!
        if (!textSafe(g, event.body, event.bodyVariants, event.historicalPeople)) totals.unsafePendingBody++
        const selected = choice(g, event, policy)
        if (selected < 0) throw Error(`No choice for ${g.pending}, seed ${seed}`)
        g = decide(g, selected)
      } else {
        while (!g.stopped && !g.pending && g.phase < 3) g = beat(g)
        g = tick(g)
      }
      const found = findInconsistencies(g)
      totals.violations += found.length
      for (const issue of found) {
        const kind = issue.replace(/^возраст \d+: /, '')
        problems[kind] = (problems[kind] ?? 0) + 1
      }
    }
    if (!g.stopped) throw Error(`Incomplete life ${seed}`)
    totals.lives++
    totals.encounterEligible += Number(eligible)
    totals.encountered += Number(g.seen.includes('people-new-encounter'))
    totals.met += Number(g.people.some(p => p.id === 'story-acquaintance'))
    totals.partner += Number(everPartner)
    totals.newPartner += Number(everNewPartner)
    totals.cohabited += Number(everCohabited)
    totals.child += Number(g.people.some(p => p.id === 'child'))
    totals.child15 += Number(age15); totals.child26 += Number(age26)
    totals.adultChildEligible += Number(adultEligible)
    totals.incomplete += Number(g.flags.peopleEncounter === 'met' && !g.flags.peopleChoice || g.flags.peopleChoice === 'partner' && !g.flags.peopleHome)
    totals.duplicates += Number(new Set(g.people.map(p => p.id)).size !== g.people.length)
    totals.bytes += Buffer.byteLength(JSON.stringify(g))
    totals.people += g.people.length
  }
  report[policy] = { ...totals, meanPeople: totals.people / count, meanSaveBytes: Math.round(totals.bytes / count) }
}
console.log(JSON.stringify({ seeds: [7001, 7000 + count], method: 'paired deterministic choices; family seeks relationships, career focuses work, avoid uses relationship focus but declines romance', problems, report }, null, 2))
