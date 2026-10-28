/** Deterministic Markdown views of the saved T8 JSON; no simulation or rule mutation.
 * node scripts/economy-t8-tables.mjs baseline path.json
 * node scripts/economy-t8-tables.mjs experiments S0.json S1.json S2.json S3.json
 */
import { readFileSync } from 'node:fs'
const [mode, ...files] = process.argv.slice(2)
const reports = files.map(p => JSON.parse(readFileSync(p, 'utf8')))
const f = (x, digits = 1) => x === null || x === undefined ? '—' : Number(x).toFixed(digits)
const p = x => x === null || x === undefined ? '—' : f(x) + '%'
const row = xs => '| ' + xs.join(' | ') + ' |'
const table = (header, rows) => [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n') + '\n'
const section = (title, header, rows) => '\n## ' + title + '\n\n' + table(header, rows)
const q = (g, age, key = 'p50') => g.checkpoints[age].balance[key]
let out = ''
if (mode === 'baseline') {
  const r = reports[0], groups = Object.entries(r.groups)
  out += section('Балансы и выживание', ['Режим/политика', '20 p50', '40 p50 (N)', '60 p10 / p50 / p90', '80 p50 (N)', '60 резерв, лет'], groups.map(([k, g]) =>
    [k, f(q(g, 20), 0), `${f(q(g, 40), 0)} (${g.checkpoints[40].observations})`, ['p10', 'p50', 'p90'].map(v => f(q(g, 60, v), 0)).join(' / '), `${f(q(g, 80), 0)} (${g.checkpoints[80].observations})`, f(g.checkpoints[60].reserveYears.p50)]))
  out += '\nN — число живых в контрольном возрасте, из 100 исходных seed. Процентили не включают умерших. Полные p10/p50/p90/mean и доли доживших для всех четырёх возрастов — в JSON. Тарифный эквивалент определён только для работающего героя; у пенсионера он null, а не ноль.\n'
  out += section('Конкуренция решений', ['Политика', 'T8a', 'Деньги', 'Внимание', 'Риск 3 лет', 'Нет подходящих', 'Подходят, недоступны', '≥2 категории', 'Купить всё'], groups.map(([k, g]) => {
    const c = g.choiceQuality
    return [k, ...['historicalContestedPct', 'financialConflictPct', 'attentionConflictPct', 'intertemporalConflictPct', 'noEligiblePct', 'nothingAvailablePct', 'atLeastTwoAvailableCategoriesPct', 'canBuyAllPct'].map(v => p(c[v]))]
  }))
  out += '\nЗнаменатель — живые взрослые окна перед магазином. Нет подходящих ≠ нет денег. Пара конкурирует только между разными категориями, если обе покупки доступны по отдельности. Курс и переобучение — одна карьерная категория. Риск 3 лет учитывает новые обязательства только если исходный прогноз безопасен. T8a сохраняется отдельно; требование «купить все шесть» часто упирается в суммарное внимание и само по себе не доказывает интересный выбор.\n'
  out += section('Покупки, трудные годы, нагрузка', ['Политика', 'Типов p50', 'Покупок p50', 'Нет покупок', 'Необяз. расходы/жизнь, mean', 'Трудные взрослые годы', 'Лет помощи', 'Понижений жилья', 'Жизней 0,6'], groups.map(([k, g]) => [k, f(g.purchases.categoriesPerLife.p50), f(g.purchases.perLife.p50), p(g.purchases.noPurchasesPct), f(g.spending.perLife.mean, 0), p(g.hardshipFull.tightAdultYearsPct), g.hardship.aidYears, g.hardship.housingLosses, p(g.load.livesUsedPct)]))
  out += section('Состояние к 60 годам, режим B', ['Политика', 'N', 'Здоровье', 'Настроение', 'Стресс', 'Связи', 'Знания', 'Репутация', 'Близкие: средняя связь', 'Воспоминания'], groups.filter(([k]) => k.startsWith('B/')).map(([k, g]) => {
    const w = g.wellbeingAtAge[60]
    return [k, w.observations, ...['health', 'morale', 'stress', 'bonds', 'knowledge', 'reputation'].map(s => f(w.stats[s].p50)), f(w.meanLivingPersonBond.p50), f(w.memories.p50)]
  }))
  out += section('T7 после покупки, режим B', ['Политика / покупка', 'Покупатели', 'Подходили', 'Предложено', 'Прожито', 'Из них позднее', 'Прожито / подходили', 'Не предложено подходящим', 'Умерли до нижней границы'], groups.filter(([k]) => k.startsWith('B/')).flatMap(([k, g]) => Object.entries(g.narrative.perPurchase).filter(([, h]) => h.buyers).map(([id, h]) => [k + ' / ' + id, h.buyers, h.eligibleBuyers, h.offeredLives, h.experiencedLives, h.delayedExperiencedLives, p(h.experiencedPctOfEligible), h.eligibleButNeverOffered, h.diedBeforeAgeAndLagFloor])))
  out += '\nОдин покупатель учитывается один раз по каждому типу, независимо от числа поездок. Дневник покупки не считается историей. «Позднее» означает положительный since/ownedYears в условиях контента. У переобучения нет прямого T7-hook; у обычного курса нет m-window-course без story-window. Нижняя граница возраста/задержки — необходимое условие, а не утверждение, что все остальные условия были бы выполнены. Подходящие, но не предложенные окна смешивают ритм, выбор RNG и конкуренцию контента; они не доказывают ошибку Director.\n'
  if (r.diagnosticsIncluded) {
    const entries = Object.entries(r.diagnostics)
    out += section('Переобучение: возраст и цель', ['Режим/вариант', 'Перешли', 'Свой доход восстановлен, лет p50 (N)', 'Δ заработка mean, %', 'Δ пенсии mean', 'Δ стажа mean', 'Новая история/момент'], entries.filter(([k]) => /Switcher/.test(k)).map(([k, d]) => {
      const a = d.retraining ?? d
      return [k, a.switchedLives, `${f(a.ownRecovery.p50)} (${a.ownRecovery.observations})`, f(a.paired.lifetimeWageDeltaSwitchedPct.mean), f(a.paired.pensionLifetimeDeltaSwitched.mean, 0), f(a.paired.finalServiceDeltaSwitched.mean), p(a.narrative.uniqueNewProfessionExperiencedPct)]
    }))
    out += section('Переобучение по реальным направлениям (все три цели)', ['Возраст / режим / направление', 'N', 'Δ заработка mean, %', 'Δ совместного заработка mean, %', 'Δ первой пенсии mean', 'Не достигли паритета'], entries.filter(([k]) => /Switcher/.test(k)).flatMap(([k, d]) => {
      const a = d.retraining ?? d
      return Object.entries(a.byDirection).map(([direction, v]) => [k + ' / ' + direction, v.observations, f(v.lifetimeWageDeltaSwitchedPct.mean), f(v.jointPostSwitchWageDeltaPct.mean), f(v.firstPensionDeltaSwitched.mean), v.neverParity])
    }))
    out += '\nЗаработок legacy T5 включает выплаты наставничества; activeWorkWageDelta и mentorIncomeDelta в wellbeing отделяют их. Возврат к собственной оплате ≠ паритет с продолжающим расти контролем. N редких направлений мал; отсутствующие наблюдения не равны нулевому эффекту.\n'
    out += section('Пенсионные пути', ['Режим/путь', 'Жизней с решением', 'Пенсия/исходную жизнь mean', 'Наставничество/исходную жизнь mean', '80 баланс p50 (N)', '70 здоровье / стресс / связи p50', 'Смерть mean', 'Исчерпание резерва', 'Потери жилья'], entries.filter(([k]) => /Retirement-(left|mentor|continue)$/.test(k)).map(([k, g]) => [k, Object.values(g.professionalLife.pensionPaths).reduce((a, b) => a + b, 0) - (g.professionalLife.pensionPaths['no-story'] ?? 0), f((g.career.pensionPerLife.mean ?? 0) * g.career.retirees / g.lives, 0), f(g.professionalLife.mentorIncome.mean, 0), `${f(q(g, 80), 0)} (${g.checkpoints[80].observations})`, ['health', 'stress', 'bonds'].map(s => f(g.wellbeingAtAge[70].stats[s].p50)).join(' / '), f(g.deathAge.mean), p(g.hardship.exhaustedOnPension.pct), g.hardship.housingLosses]))
    out += section('Парные проверки одного решения', ['Сравнение', 'Δ баланс80 p50 (N)', 'Δ здоровье70 mean', 'Δ стресс70 mean', 'Δ связи70 mean', 'Δ возраст смерти mean', 'Совпала предыстория пенсии'], entries.filter(([k]) => /TimeBuyerReducedVsFull|RetirementPaired|StoryHelperVsModerate/.test(k)).flatMap(([k, d]) => {
      const pairs = d.paired ? [[k, d.paired]] : d.mentorVsLeft ? [[k + '/mentor', d.mentorVsLeft], [k + '/continue', d.continueVsLeft]] : [[k, d]]
      return pairs.map(([name, a]) => [name, `${f(a.checkpoints[80].balanceDelta.p50, 0)} (${a.checkpoints[80].pairs})`, f(a.age70.health.mean), f(a.age70.stress.mean), f(a.age70.bonds.mean), f(a.deathAgeDelta.mean), name.includes('Retirement') ? a.preRetirementFingerprintsMatch : '—'])
    }))
  }
  out += '\n## Техническая целостность\n\n' + `Завершено ${r.integrity.completedLives} жизней; ${r.integrity.checks} проверок инвариантов; нарушений ${r.integrity.violations}; ошибок сверки ${r.integrity.accountingErrors.length}. Источник правил: \`${r.rulesSourceFingerprint}\`.\n`
} else if (mode === 'diagnostics') {
  const r = reports[0]
  out += section('Следующий разряд после реального перехода, B', ['Возраст/цель', 'Перешли', 'Лет до следующего разряда p10 / p50 / p90 (N)', 'Не наблюдался', 'Стажировка после покупки, лет mean', 'Δ здоровье60 mean (N)'], Object.entries(r.retraining).map(([k, a]) => [k, a.switchedLives, ['p10', 'p50', 'p90'].map(v => f(a.nextGradeAfterSwitchYears[v])).join(' / ') + ` (${a.nextGradeAfterSwitchYears.observations})`, a.noNextGradeObserved, f(a.postSwitchAdultTraineeYears.mean), `${f(a.jointAge60HealthDelta.mean)} (${a.jointAge60HealthDelta.observations})`]))
  out += '\nЭто первый разряд выше начального после понижения при покупке, а не прежний первый IV разряд героя до смены работы. Ненаблюдаемое повышение цензурировано смертью/окончанием жизни, а не записано как ноль лет. Подробные направления — в diagnostics JSON.\n'
  out += section('Доступность позднего контента, B', ['Сюжет/момент', 'left: подходили / прожили', 'mentor: подходили / прожили', 'continue: подходили / прожили'], Object.keys(r.pensions.left.lateContent).map(id => [id, ...['left', 'mentor', 'continue'].map(path => { const h = r.pensions[path].lateContent[id]; return h.eligibleLives + ' / ' + h.experiencedLives })]))
  out += `\nДополнительные прогоны: ${r.integrity.completedLives} жизней, ${r.integrity.checks} проверок, нарушений ${r.integrity.violations}, ошибок сверки ${r.integrity.accountingErrors}.\n`
} else if (mode === 'experiments') {
  out += section('Сценарии на общих development seed', ['Сценарий / режим / политика', '60 p10 / p50 / p90', '80 p10 / p50 / p90', 'Деньги / внимание', 'Нет подходящих', 'Трудные годы', 'Помощь / потери жилья', '0,6 жизней', 'Поздний T7 жизней'], reports.flatMap(r => Object.entries(r.groups).map(([k, g]) => [r.scenario + '/' + k, ['p10', 'p50', 'p90'].map(v => f(q(g, 60, v), 0)).join(' / '), ['p10', 'p50', 'p90'].map(v => f(q(g, 80, v), 0)).join(' / '), p(g.choiceQuality.financialConflictPct) + ' / ' + p(g.choiceQuality.attentionConflictPct), p(g.choiceQuality.noEligiblePct), p(g.hardshipFull.tightAdultYearsPct), g.hardship.aidYears + ' / ' + g.hardship.housingLosses, p(g.load.livesUsedPct), p(g.narrative.t7DelayedLivesPct)])))
  out += section('Связанные риски: ранние годы, агрономы, дети, пенсия', ['Сценарий/политика B', '18–29 деньги/внимание', '60+ деньги/внимание', 'Агроном: трудных лет/наблюдений', 'С детьми жизней / трудных лет', '3 тяжёлых подряд, жизней', 'Пенсионный резерв сокращался', 'III / IV разряд, жизней'], reports.flatMap(r => Object.entries(r.groups).filter(([k]) => k.startsWith('B/')).map(([k, g]) => [r.scenario + '/' + k, p(g.choiceQuality.byAge['18-29'].moneyPct) + ' / ' + p(g.choiceQuality.byAge['18-29'].attentionPct), p(g.choiceQuality.byAge['60-120'].moneyPct) + ' / ' + p(g.choiceQuality.byAge['60-120'].attentionPct), g.professionalLife.byProfession['Агроном'].tightYears + ' / ' + g.professionalLife.byProfession['Агроном'].years, g.hardshipFull.everChildLives + ' / ' + g.hardshipFull.childTightYears, p(g.hardshipFull.livesWith3ConsecutivePct), p(g.hardshipFull.pensionReservesDecliningPct), p(g.career.reached3Pct) + ' / ' + p(g.career.reached4Pct)])))
} else throw Error('Use baseline, diagnostics or experiments and saved JSON paths')
process.stdout.write(out)
