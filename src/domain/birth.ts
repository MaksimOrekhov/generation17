import type { Birth, Job, Peer, Person, SectorId, Wealth } from './types'
import { pick, random, weighted } from './random'
import type { Rng } from './random'
import { infantRiskFor } from './mortality'

export interface SectorDef {
  id: SectorId
  name: string
  deck: string
  /** Доля новорождённых, появляющихся в секторе. */
  share: number
  /** Вероятности достатка семьи 1…5 внутри сектора. */
  wealth: readonly [number, number, number, number, number]
  jobs: readonly string[]
  /** Профессия, к которой тянутся дети сектора. */
  leaning: Job
  blurb: string
}

export const sectors: readonly SectorDef[] = [
  {
    id: 'atrium', name: 'Жилой атриум', deck: 'A-6', share: .17, wealth: [.03, .1, .3, .35, .22],
    jobs: ['координатор жилых служб', 'преподаватель архива', 'помощник совета', 'куратор общественного сада', 'диспетчер связи'],
    leaning: 'Координатор', blurb: 'Широкие коридоры, живая зелень и окна на обзорную палубу.'
  },
  {
    id: 'bio', name: 'Сектор биокуполов', deck: 'E-2', share: .2, wealth: [.1, .25, .35, .22, .08],
    jobs: ['агроном биокупола', 'оператор освещения теплиц', 'садовод', 'лаборант семенного банка', 'учётчик урожая'],
    leaning: 'Агроном', blurb: 'Тёплый влажный воздух и запах земли даже в жилых блоках.'
  },
  {
    id: 'engineering', name: 'Инженерный сектор', deck: 'B-4', share: .24, wealth: [.12, .28, .34, .18, .08],
    jobs: ['техник систем воздуха', 'сварщик корпуса', 'электрик энергоузла', 'диспетчер ремонтных смен', 'механик насосов'],
    leaning: 'Техник', blurb: 'Гул насосов не смолкает ни днём, ни ночью — к нему привыкают раньше, чем к голосам.'
  },
  {
    id: 'clinic', name: 'Клинический сектор', deck: 'D-1', share: .11, wealth: [.05, .15, .3, .3, .2],
    jobs: ['медбрат', 'врач-терапевт', 'фармацевт', 'санитар', 'лаборант клиники'],
    leaning: 'Медик', blurb: 'Тихие белые коридоры, где никто не повышает голос.'
  },
  {
    id: 'lower', name: 'Нижняя палуба', deck: 'C-3', share: .28, wealth: [.34, .33, .2, .1, .03],
    jobs: ['работник прачечной', 'уборщик технических коридоров', 'подсобный рабочий', 'оператор переработки воды', 'упаковщик пайков'],
    leaning: 'Техник', blurb: 'Низкие потолки, общие кухни и вечный шум вентиляции над головой.'
  }
]

export const wealthNames: Record<Wealth, string> = {
  1: 'семья из самых малообеспеченных',
  2: 'семья с небольшим достатком',
  3: 'семья со средним достатком',
  4: 'обеспеченная семья',
  5: 'семья из самых обеспеченных'
}

export const sectorById = (id: SectorId) => sectors.find(s => s.id === id)!

const givenNames = ['Иона', 'Рен', 'Ника', 'Кай', 'Ари', 'Мика', 'Лин', 'Тал', 'Эрин', 'Сол', 'Вея', 'Ори', 'Нил', 'Аэль', 'Тео', 'Мира']
const surnames = ['Марек', 'Восс', 'Рейн', 'Мор', 'Сандер', 'Орт', 'Кель', 'Авар', 'Ильм', 'Ларс', 'Дорн', 'Весна', 'Бер', 'Кан']
const mothers = ['Ада', 'Лея', 'Мара', 'Ория', 'Сана', 'Ийна', 'Арина', 'Кайя', 'Ливия', 'Нора']
const fathers = ['Томас', 'Элиас', 'Ори', 'Натан', 'Марк', 'Дан', 'Арден', 'Рон', 'Вейл', 'Тарен']
const brothers = ['Тео', 'Ким', 'Руди', 'Лев', 'Саэль', 'Ян']
const sisters = ['Эмма', 'Клара', 'Эйла', 'Соль', 'Нея', 'Оли']
const friends = ['Ника', 'Томас', 'Лея', 'Марк', 'Эйла', 'Соль']
const neighbors = ['Руди', 'Эмма', 'Клара', 'Тарен', 'Оли', 'Ким']
const mentors = ['Элиана', 'Май', 'Вейл', 'Арден', 'Риа', 'Нор']
const traits = ['Наблюдательный', 'Осторожный', 'Любознательный', 'Упрямый', 'Добросердечный']
const healthNotes: readonly (readonly [string, number, number])[] = [
  ['Отличное', 6, 2], ['Хорошее', 0, 5], ['Хорошее, склонность к простуде', -2, 3], ['Слабый иммунитет, но крепкий характер', -6, 1]
]
const jobs: readonly Job[] = ['Техник', 'Медик', 'Агроном', 'Координатор']

/** Ожидаемая продолжительность жизни: условная модель, зависящая от достатка. */
export const lifeExpectancyFor = (wealth: Wealth) => Math.round(83 + (wealth - 3) * 1.5)

/** Сектор, где герой живёт сейчас: после переезда он отличается от сектора рождения. */
export const residenceOf = (g: { residence?: SectorId; birth: Birth }) => g.residence ?? g.birth.sectorId

/** Имя ребёнка героя: из общего списка, без совпадений с уже известными людьми. */
export function pickChildName(g: Rng, surname: string, taken: readonly string[]) {
  return `${pickUnique(g, givenNames, new Set(taken))} ${surname}`
}

function pickUnique(g: Rng, pool: readonly string[], used: Set<string>) {
  const free = pool.filter(n => !used.has(n))
  const name = pick(g, free.length ? free : pool)
  used.add(name)
  return name
}

function rollWealth(g: Rng, sector: SectorDef): Wealth {
  return weighted(g, sector.wealth.map((w, i) => [(i + 1) as Wealth, w] as const))
}

export function rollSector(g: Rng): SectorDef {
  return weighted(g, sectors.map(s => [s, s.share] as const))
}

function shareOfWealth(wealth: Wealth) {
  return Math.round(sectors.reduce((sum, s) => sum + s.share * s.wealth[wealth - 1]!, 0) * 100)
}

export interface BirthRoll {
  birth: Birth
  name: string
  origin: string
  trait: string
  people: Person[]
  peers: Peer[]
  healthMod: number
}

/** Лотерея рождения. Расходует RNG игры, поэтому одинаковый seed даёт одну и ту же судьбу. */
export function rollBirth(g: Rng): BirthRoll {
  const sector = rollSector(g)
  const wealth = rollWealth(g, sector)
  const [healthNote, healthMod] = weighted(g, healthNotes.map(([n, mod, w]) => [[n, mod] as const, w] as const))
  const surname = pick(g, surnames)
  const name = `${pick(g, givenNames)} ${surname}`
  const trait = pick(g, traits)

  const used = new Set<string>()
  const motherAge = 24 + Math.floor(random(g) * 14)
  const fatherAge = motherAge + Math.floor(random(g) * 9) - 2
  const people: Person[] = [
    { id: 'parent', name: `${pickUnique(g, mothers, used)} ${surname}`, role: 'Мать', bond: 71, age: motherAge, alive: true, since: 0 },
    { id: 'parent2', name: `${pickUnique(g, fathers, used)} ${surname}`, role: 'Отец', bond: 66, age: fatherAge, alive: true, since: 0 }
  ]
  if (random(g) < .72) {
    const brother = random(g) < .5
    people.push({
      id: 'sibling', name: `${pickUnique(g, brother ? brothers : sisters, used)} ${surname}`,
      role: brother ? 'Старший брат' : 'Старшая сестра', bond: 58, age: 2 + Math.floor(random(g) * 8), alive: true, since: 0
    })
  }
  people.push(
    { id: 'friend', name: pickUnique(g, friends, used), role: 'Друг детства', bond: 43, age: 0, alive: true, since: 4 },
    { id: 'neighbor', name: pickUnique(g, neighbors, used), role: 'Сосед по сектору', bond: 34, age: 4 + Math.floor(random(g) * 5), alive: true, since: 0 },
    { id: 'mentor', name: pickUnique(g, mentors, used), role: 'Старший наставник', bond: 25, age: 25 + Math.floor(random(g) * 8), alive: true, since: 16 }
  )

  const peers: Peer[] = Array.from({ length: 5 }, (_, i) => {
    const s = rollSector(g)
    return {
      id: `peer${i + 1}`, name: `${pickUnique(g, givenNames, used)} ${pick(g, surnames)}`,
      sectorId: s.id, wealth: rollWealth(g, s), job: null, alive: true, diedAt: null
    }
  })

  const birthsThisYear = 92 + Math.floor(random(g) * 24)
  const births = Object.fromEntries(sectors.map(s => [s.id, Math.round(birthsThisYear * s.share)])) as Record<SectorId, number>
  const num = String(Math.floor(random(g) * 99999)).padStart(5, '0')
  const jobA = pick(g, sector.jobs)
  const jobB = pick(g, sector.jobs.filter(j => j !== jobA))

  const birth: Birth = {
    certNo: `PLG-190-${num}`,
    sectorId: sector.id, sectorName: sector.name, deck: sector.deck, wealth,
    parentJobs: [jobA, jobB], parentAges: [motherAge, fatherAge],
    healthNote, lifeExpectancy: lifeExpectancyFor(wealth), infantRisk: infantRiskFor(wealth),
    birthsThisYear, sectorBirths: births[sector.id], sectorShare: Math.round(sector.share * 100),
    wealthShare: shareOfWealth(wealth), births
  }
  return { birth, name, origin: `${sector.name.toLowerCase()} ${sector.deck}`, trait, people, peers, healthMod }
}

/** Ровесники выбирают профессию в 16 лет: сектор подталкивает, но не решает. */
export function peerJob(g: Rng, peer: Peer): Job {
  const lean = sectorById(peer.sectorId).leaning
  return weighted(g, jobs.map(j => [j, j === lean ? 3 : 1] as const))
}
