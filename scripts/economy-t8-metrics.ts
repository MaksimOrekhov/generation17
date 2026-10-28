import { describe } from './audit-stats'
import { pairedComparison, pct, summarizeLives } from './economy-pilot-core'
import { ownRecoveryYears, pairedRetraining, PROFESSION_MOMENTS, PROFESSION_STORIES } from './economy-career-t5-core'
import { ALL_STATS, HOOKS, IDS, OFFER_HOOKS } from './economy-t8-core'
import type { T8Life } from './economy-t8-core'
import type { OfferId } from '../src/domain/offers'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const count = (xs: string[]) => Object.fromEntries([...new Set(xs)].sort().map(k => [k, xs.filter(x => x === k).length]))
const firstBuy = (l: T8Life, id: OfferId) => l.purchases.find(p => p.id === id && p.action === 'purchase')
const at = (l: T8Life, age: number) => l.checkpoints.find(c => c.age === age)

export function hookReach(runs: T8Life[], id: OfferId) {
  const buyers = runs.filter(l => firstBuy(l, id)), hooks = HOOKS.filter(h => OFFER_HOOKS[id].includes(h.id))
  const has = (l: T8Life, key: 'eligible' | 'offered' | 'experienced', delayed = false) => hooks.filter(h => !delayed || h.delayed)
    .some(h => l.detail.hooks[h.id]![key].some(age => age >= firstBuy(l, id)!.age))
  const eligible = buyers.filter(l => has(l, 'eligible')), offered = buyers.filter(l => has(l, 'offered'))
  const experienced = buyers.filter(l => has(l, 'experienced')), delayed = buyers.filter(l => has(l, 'experienced', true))
  const floor = (l: T8Life) => Math.min(...hooks.map(h => Math.max(h.min, firstBuy(l, id)!.age + h.lag)))
  const diedEarly = buyers.filter(l => hooks.length > 0 && l.deathAge <= floor(l))
  const tooLate = buyers.filter(l => hooks.length > 0 && hooks.every(h => firstBuy(l, id)!.age + h.lag > h.max))
  const sourcePurchases = buyers.flatMap(l => l.purchases.filter(p => p.id === id))
  return { buyers: buyers.length, eligibleBuyers: eligible.length, offeredLives: offered.length,
    experiencedLives: experienced.length, delayedExperiencedLives: delayed.length,
    offeredPctOfEligible: pct(offered.filter(l => has(l, 'eligible')).length, eligible.length),
    experiencedPctOfEligible: pct(experienced.filter(l => has(l, 'eligible')).length, eligible.length),
    experiencedPctOfBuyers: pct(experienced.length, buyers.length),
    diedBeforeAgeAndLagFloor: diedEarly.length, alreadyPastAllAgeWindows: tooLate.length,
    neverEligibleOther: buyers.filter(l => hooks.length > 0 && !has(l, 'eligible') && !diedEarly.includes(l) && !tooLate.includes(l)).length,
    eligibleButNeverOffered: eligible.filter(l => !has(l, 'offered')).length,
    offeredButNotExperienced: offered.filter(l => !has(l, 'experienced')).length,
    noDirectT7Hooks: hooks.length === 0,
    ordinaryCourseWithoutStoryContext: id === 'course-pro' ? buyers.filter(l => !l.purchases.some(p => p.id === id && p.source === 'story')).length : null,
    positiveEffects: sum(sourcePurchases.map(p => p.positiveEffects)), cappedEffects: sum(sourcePurchases.map(p => p.cappedEffects)),
    cappedPct: pct(sum(sourcePurchases.map(p => p.cappedEffects)), sum(sourcePurchases.map(p => p.positiveEffects))),
    events: Object.fromEntries(hooks.map(h => {
      const relevant = buyers.map(l => ({ l, o: l.detail.hooks[h.id]!, age: firstBuy(l, id)!.age }))
      const n = relevant.filter(({ o, age }) => o.eligible.some(a => a >= age)).length
      return [h.id, { eligibleLives: n, offeredLives: relevant.filter(({ o, age }) => o.offered.some(a => a >= age)).length,
        experiencedLives: relevant.filter(({ o, age }) => o.experienced.some(a => a >= age)).length,
        eligibleNotSelectedYears: sum(relevant.map(({ o, age }) => o.eligible.filter(a => a >= age && !o.offered.includes(a)).length)),
        ageBlockedYears: sum(relevant.map(({ o, age }) => o.ageBlocked.filter(a => a >= age).length)),
        otherConditionBlockedYears: sum(relevant.map(({ o, age }) => o.otherBlocked.filter(a => a >= age).length)) }]
    })) }
}

export function summarizeT8(runs: T8Life[]) {
  const { examples: _examples, ...core } = summarizeLives(runs)
  const qs = runs.flatMap(l => l.detail.quality), ys = runs.flatMap(l => l.years), totalAdultYears = ys.filter(y => y.age >= 18).length
  const boolPct = (key: keyof typeof qs[number]) => pct(qs.filter(q => q[key] === true).length, qs.length)
  const categoryCosts = Object.fromEntries(IDS.map(id => [id, core.purchases.byType[id]!.totalCost!]))
  const storyCosts = sum(runs.map(l => l.storySpent)), voluntary = core.purchases.totalVoluntarySpending + storyCosts
  const windows = runs.flatMap(l => l.detail.storyWindows), decisions = sum(runs.map(l => l.detail.storyDecisions))
  const pensions = runs.filter(l => l.years.some(y => y.kind === 'retired'))
  return { ...core,
    choiceQuality: { adultWindows: qs.length, historicalContestedPct: boolPct('historicalContested'),
      financialConflictPct: boolPct('moneyConflict'), attentionConflictPct: boolPct('attentionConflict'),
      intertemporalConflictPct: boolPct('intertemporal'),
      atLeastTwoAvailableOffersPct: pct(qs.filter(q => q.available >= 2).length, qs.length),
      atLeastTwoAvailableCategoriesPct: pct(qs.filter(q => q.categories >= 2).length, qs.length),
      canBuyAllPct: boolPct('canBuyAll'), noEligiblePct: boolPct('noEligible'), nothingAvailablePct: boolPct('nothingAvailable'),
      boundByMoneyPct: boolPct('moneyBound'), boundByAttentionPct: boolPct('attentionBound'),
      ageBoundPct: boolPct('ageBound'), cooldownBoundPct: boolPct('cooldownBound'), targetBoundPct: boolPct('targetBound'), otherConditionsBoundPct: boolPct('conditionBound'),
      reducedLoadAvailablePct: boolPct('loadAvailable'),
      perOffer: Object.fromEntries(IDS.map(id => [id, { eligibleWindows: qs.filter(q => q.offers[id]!.eligible).length,
        availableWindows: qs.filter(q => q.offers[id]!.available).length,
        blockers: count(qs.map(q => q.offers[id]!.blocker)) }])),
      byAge: Object.fromEntries([[18, 29], [30, 39], [40, 59], [60, 120]].map(([from, to]) => {
        const rows = qs.filter(q => q.age >= from! && q.age <= to!)
        return [`${from}-${to}`, { windows: rows.length, historicalPct: pct(rows.filter(q => q.historicalContested).length, rows.length),
          moneyPct: pct(rows.filter(q => q.moneyConflict).length, rows.length), attentionPct: pct(rows.filter(q => q.attentionConflict).length, rows.length),
          intertemporalPct: pct(rows.filter(q => q.intertemporal).length, rows.length), noEligiblePct: pct(rows.filter(q => q.noEligible).length, rows.length) }]
      })) },
    spending: { voluntaryTotal: voluntary, perLife: describe(runs.map(l => l.purchaseSpent + l.storySpent + sum(l.years.map(y => y.rent + y.domeCost)))),
      categories: Object.fromEntries([...IDS.map(id => [id, { total: categoryCosts[id], sharePct: pct(categoryCosts[id]!, voluntary) }]), ['story-help', { total: storyCosts, sharePct: pct(storyCosts, voluntary) }]]),
      entryFees: sum(runs.map(l => l.purchaseSpent)), shopEntryFees: sum(runs.flatMap(l => l.purchases.filter(p => p.source === 'shop').map(p => p.cost))),
      storyCatalogueFees: sum(runs.map(l => l.detail.storyCatalogueCost)), storyExpenses: storyCosts, storyIncome: sum(runs.map(l => l.detail.storyIncome)),
      annualObligationsPaid: sum(runs.map(l => l.annualSpent)), rent: sum(ys.map(y => y.rent)), services: sum(ys.map(y => y.domeCost)),
      retrainFees: sum(runs.flatMap(l => l.purchases.filter(p => p.id === 'retrain').map(p => p.cost))) },
    professionalLife: { finalProfessions: count(runs.map(l => l.finalJob)), annualProfessions: count(ys.filter(y => y.age >= 18).map(y => y.job)),
      annualWorkingYears: describe(runs.map(l => l.years.filter(y => y.working).length)),
      adultTraineeYears: describe(runs.map(l => l.years.filter(y => y.age >= 18 && y.kind === 'trainee').length)),
      fullLoadService: describe(runs.map(l => sum(l.years.filter(y => y.working && !y.reduced).map(y => y.serviceDelta)))),
      reducedLoadService: describe(runs.map(l => sum(l.years.filter(y => y.reduced).map(y => y.serviceDelta)))),
      activeWorkWage: describe(runs.map(l => sum(l.years.filter(y => y.kind !== 'retired').map(y => y.wage)))),
      mentorIncome: describe(runs.map(l => sum(l.years.map(y => y.mentorWage)))),
      pensionPaths: count(runs.map(l => l.detail.retirement?.path ?? 'no-story')),
      retrainCount: describe(runs.map(l => l.purchases.filter(p => p.id === 'retrain').length)),
      byProfession: Object.fromEntries(['Техник', 'Медик', 'Агроном', 'Координатор'].map(job => {
        const rows = ys.filter(y => y.job === job && y.age >= 18)
        return [job, { years: rows.length, wage: describe(rows.filter(y => y.working).map(y => y.wage)),
          tightYears: rows.filter(y => y.tight).length, aid: sum(rows.map(y => y.aid)), balance: describe(rows.map(y => y.balance)) }]
      })) },
    wellbeingAtAge: Object.fromEntries([40, 60, 65, 70, 80].map(age => {
      const cs = runs.flatMap(l => l.checkpoints.filter(c => c.age === age))
      return [age, { observations: cs.length, survivingPct: pct(cs.length, runs.length), stats: Object.fromEntries(ALL_STATS.map(k => [k, describe(cs.map(c => c.stats[k]))])),
        meanLivingPersonBond: describe(cs.map(c => c.meanBond)), liveClosePeople: describe(cs.map(c => c.liveClosePeople)),
        memories: describe(cs.map(c => c.memories)), followups: describe(cs.map(c => c.followups)),
        saturationPct: Object.fromEntries(ALL_STATS.map(k => [k, pct(cs.filter(c => c.stats[k] === 0 || c.stats[k] === 100).length, cs.length)])) }]
    })),
    saturation: { positiveDirectEffects: sum(runs.map(l => l.detail.saturation.positive)),
      fullyCappedDirectEffects: sum(runs.map(l => l.detail.saturation.capped)), attenuatedDirectEffects: sum(runs.map(l => l.detail.saturation.attenuated)),
      fullyCappedPct: pct(sum(runs.map(l => l.detail.saturation.capped)), sum(runs.map(l => l.detail.saturation.positive))) },
    narrative: { perPurchase: Object.fromEntries(IDS.map(id => [id, hookReach(runs, id)])),
      decisions, economicDecisionWindows: windows.filter(w => w.id !== 'retirement').length,
      economicDecisionPct: pct(windows.filter(w => w.id !== 'retirement').length, decisions),
      paidDecisionPct: pct(windows.filter(w => w.cost > 0).length, decisions),
      exclusivePaidCategories: windows.filter(w => w.paidCategories >= 2).length,
      offeredMomentsPerLife: describe(runs.map(l => l.detail.offeredMoments)),
      t7ExperiencedPerLife: describe(runs.map(l => sum(Object.values(l.detail.hooks).map(o => o.experienced.length)))),
      t7DelayedLivesPct: pct(runs.filter(l => HOOKS.filter(h => h.delayed).some(h => l.detail.hooks[h.id]!.experienced.length)).length, runs.length),
      perEvent: Object.fromEntries(HOOKS.map(h => [h.id, { eligibleLives: runs.filter(l => l.detail.hooks[h.id]!.eligible.length).length,
        offeredLives: runs.filter(l => l.detail.hooks[h.id]!.offered.length).length,
        experiencedLives: runs.filter(l => l.detail.hooks[h.id]!.experienced.length).length,
        eligibleNotSelectedYears: sum(runs.map(l => { const o = l.detail.hooks[h.id]!; return o.eligible.filter(a => !o.offered.includes(a)).length })) }])) },
    hardshipFull: { settledAdultYears: totalAdultYears, tightAdultYears: ys.filter(y => y.age >= 18 && y.tight).length,
      tightAdultYearsPct: pct(ys.filter(y => y.age >= 18 && y.tight).length, totalAdultYears),
      livesWith3ConsecutivePct: pct(runs.filter(l => l.years.some(y => y.streak >= 3)).length, runs.length),
      pensionReservesDecliningPct: pct(pensions.filter(l => l.years.some(y => y.kind === 'retired' && y.balance < y.opening)).length, pensions.length),
      everChildLives: runs.filter(l => l.years.some(y => y.child)).length,
      childYears: ys.filter(y => y.child).length, childTightYears: ys.filter(y => y.child && y.tight).length,
      everChildBalance60: describe(runs.filter(l => l.years.some(y => y.child)).map(l => at(l, 60)?.balance)) },
    settlementChecks: sum(runs.map(l => l.detail.balancesReconciled)) }
}

export function comparePolicies(treatment: T8Life[], control: T8Life[]) {
  const generic = pairedComparison(treatment, control)
  const pairs = treatment.map((t, i) => { const c = control[i]!; if (t.seed !== c.seed) throw Error('Unpaired'); return [t, c] as const })
  return { ...generic, activeWorkWageDelta: describe(pairs.map(([t, c]) => sum(t.years.filter(y => y.kind !== 'retired').map(y => y.wage)) - sum(c.years.filter(y => y.kind !== 'retired').map(y => y.wage)))),
    deathAgeDelta: describe(pairs.map(([t, c]) => t.deathAge - c.deathAge)),
    mentorIncomeDelta: describe(pairs.map(([t, c]) => sum(t.years.map(y => y.mentorWage)) - sum(c.years.map(y => y.mentorWage)))),
    preRetirementFingerprintsMatch: pairs.every(([t, c]) => t.detail.retirement?.beforeFingerprint === c.detail.retirement?.beforeFingerprint),
    age70: Object.fromEntries(ALL_STATS.map(k => [k, describe(pairs.map(([t, c]) => { const a = at(t, 70), b = at(c, 70); return a && b ? a.stats[k] - b.stats[k] : null }))])) }
}

export function retrainingReport(runs: T8Life[], control: T8Life[]) {
  const switched = runs.filter(l => l.retrain.age !== null), bySeed = new Map(control.map(l => [l.seed, l]))
  const pair = (rows: T8Life[]) => pairedRetraining(rows, rows.map(l => bySeed.get(l.seed)!))
  const directions = [...new Set(switched.map(l => `${l.retrain.from} → ${l.retrain.to}`))].sort()
  const narrative = (l: T8Life, kind: 'story' | 'accepted' | 'offered') => l.detail.professionEvents.some(e => e.age > l.retrain.age! && e.job === l.retrain.to &&
    e.kind === kind && (kind === 'story' ? PROFESSION_STORIES[l.retrain.to!]!.includes(e.id) : PROFESSION_MOMENTS[l.retrain.to!] === e.id))
  return { attemptingLives: runs.filter(l => l.retrain.attempts.length).length, switchedLives: switched.length,
    switchAge: describe(switched.map(l => l.retrain.age)), ownRecovery: describe(switched.map(ownRecoveryYears)),
    narrative: { newProfessionStoryLives: switched.filter(l => narrative(l, 'story')).length,
      newProfessionMomentOfferedLives: switched.filter(l => narrative(l, 'offered')).length,
      uniqueNewProfessionExperiencedPct: pct(switched.filter(l => narrative(l, 'story') || narrative(l, 'accepted')).length, switched.length) },
    paired: pair(runs), byDirection: Object.fromEntries(directions.map(direction => {
      const rows = switched.filter(l => `${l.retrain.from} → ${l.retrain.to}` === direction)
      return [direction, { observations: rows.length, ...pair(rows) }]
    })), wellbeing: comparePolicies(runs, control) }
}

export function exampleLife(l: T8Life) {
  return { seed: l.seed, policy: l.detail.policy, acceptMoments: l.detail.mode, deathAge: l.deathAge,
    checkpoints: l.checkpoints, purchases: l.purchases.map(({ age, id, source, cost, target, action, cappedEffects }) => ({ age, id, source, cost, target, action, cappedEffects })),
    storyDecisions: l.detail.storyWindows, workChanges: l.detail.workChanges, loadChanges: l.loadChanges, retirement: l.detail.retirement,
    hardship: l.years.filter(y => y.tight || y.aid > 0).map(y => ({ age: y.age, balance: y.balance, wage: y.wage, pension: y.pension, bills: y.bills, aid: y.aid, housingLoss: y.housingLoss, serviceCancelled: y.serviceCancelled })),
    narrative: HOOKS.flatMap(h => l.detail.hooks[h.id]!.experienced.map(age => ({ age, id: h.id, title: h.title }))).sort((a, b) => a.age - b.age || a.id.localeCompare(b.id)),
    metrics: { wage: l.wage, pension: l.pension, totalSpent: l.totalSpent, storySpent: l.storySpent, memories: l.memories, followups: l.followups } }
}
