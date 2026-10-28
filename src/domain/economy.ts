import { clamp } from './random'
import type { GameState, Job, Skill } from './types'
export type WorkKind = 'child'|'trainee'|'working'|'between'|'sick'|'retired'
export type Grade = 1|2|3|4
export type Housing = 0|1|2
export interface Work { kind: WorkKind; load: number; grade: Grade; jobSince: number; gradeSince: number; courses: number; service: number; lastWage: number; until: number|null; path: 'left'|'mentor'|'continue'|null; deferYears: number; mentor: boolean; post: 'none'|'held'|'ended'; job: Job }
export interface Txn { n:number; age:number; kind:string; ref:string; label:string; amount:number }
export interface YearRow { age:number; wage:number; pension:number; bills:number; aid:number; balance:number }
export interface Economy { v:1; balance:number; work:Work; housing:Housing; housingRight:{tier:1|2;until:number}|null; services:Record<string,number>; owned:Record<string,number>; lastBought:Record<string,number>; goal:string|null; tightStreak:number; settledAge:number; years:YearRow[]; ledger:Txn[]; nextTxn:number; totals:{earned:number;spent:number;given:number;aid:number}; estate:number|null }
export const ECONOMY_TUNING = { wages: { 'Техник':[1100,1350,1600,1850], 'Медик':[1050,1300,1600,1900], 'Агроном':[950,1200,1450,1700], 'Координатор':[1150,1400,1700,2050], 'Ученик':[650,650,650,650], 'Без специальности':[650,650,650,650] } satisfies Record<Job,number[]>, start:[0,0,200,400,700,1100], rent:[0,280,640], services:{domePass:90}, personal:350, child:150, trainee:360, limit:77 } as const
const skill:Partial<Record<Job,Skill>> = { 'Техник':'engineering','Медик':'medicine','Агроном':'ecology','Координатор':'social' }
/** Четыре основные специальности: только между ними возможно переобучение. */
export const PROFESSIONS = ['Техник','Медик','Агроном','Координатор'] as const satisfies readonly Job[]
export const isProfession = (job: Job) => job === 'Техник' || job === 'Медик' || job === 'Агроном' || job === 'Координатор'
export const professionSkillOf = (job: Job): Skill | null => skill[job] ?? null
/** Прибавка к профильному навыку новой специальности при любом переобучении (сюжетном или купленном). */
export const RETRAIN_SKILL_BONUS = 9
export function initEconomy():Economy { return {v:1,balance:0,work:{kind:'child',load:1,grade:1,jobSince:18,gradeSince:18,courses:0,service:0,lastWage:650,until:null,path:null,deferYears:0,mentor:false,post:'none',job:'Ученик'},housing:0,housingRight:null,services:{},owned:{},lastBought:{},goal:null,tightStreak:0,settledAge:0,years:[],ledger:[],nextTxn:1,totals:{earned:0,spent:0,given:0,aid:0},estate:null} }
export function wageOf(g:GameState):number { const w=g.economy.work; return ECONOMY_TUNING.wages[g.protagonist.job][w.grade-1]! }

/**
 * Пороги присвоения разряда (§3.2) — единственный источник и для earnedGrade(), и для gradeProgress().
 * `since: 'job'` — годы на специальности (с work.jobSince), `'grade'` — годы в текущем разряде (с work.gradeSince).
 */
export const GRADE_RULES = [
 { from: 1, skill: 18, courses: 0, years: 3, since: 'job' },
 { from: 2, skill: 45, courses: 1, years: 10, since: 'job' },
 { from: 3, skill: 60, courses: 2, years: 8, since: 'grade' }
] as const
export interface GradeRequirement { key: 'skill' | 'courses' | 'years'; since?: 'job' | 'grade'; current: number; required: number; met: boolean }
export interface GradeProgress {
 job: Job
 skill: Skill | null
 grade: Grade
 /** Следующий разряд; `null` — у специальности нет разрядов или достигнут IV. */
 next: Grade | null
 requirements: GradeRequirement[]
 /** Все условия выполнены: earnedGrade() повысит разряд на ближайшем расчёте обычной работы. */
 ready: boolean
 /** Карьерное состояние, по которому считаются условия (после оформленной, но не рассчитанной смены профессии — уже новое). */
 work: Work
}

/**
 * Карьерное состояние после смены профессии (§3.2). Единственное место, где экономика применяет переход:
 * разряд −1 (не ниже I), курсы обнуляются, назначение завершается, год стажировки на 60% тарифа.
 * Мутирует переданный Work. Вызывается settleYear() на первом расчёте после смены `protagonist.job` —
 * и для сюжетной смены, и для купленной `retrain`. После вызова `work.job` совпадает с профессией героя,
 * поэтому повторный расчёт, прогноз или загрузка сохранения не применяют переход второй раз.
 */
export function onJobChange(w: Work, job: Job, age: number) {
 const retraining = isProfession(w.job)
 if (retraining) {
  w.grade = Math.max(1, w.grade - 1) as Grade
  w.courses = 0
  if (w.post === 'held') w.post = 'ended'
  w.kind = 'trainee'
  w.until = age + 1
 }
 w.job = job
 // Сюжет или покупка уже изменили навык; экономика отвечает только за карьерное состояние.
 w.jobSince = retraining ? age : Math.max(16, age - 1)
 w.gradeSince = age
}

/**
 * Герой переходит в другую специальность: профессия меняется сразу, профильный навык новой специальности +9.
 * Общая часть сюжетного `effects.job: 'Переобучение'` и покупки `retrain`; карьерные последствия
 * (разряд, курсы, назначение, стажировка) применит onJobChange() на ближайшем годовом расчёте.
 */
export function changeProfession(g: GameState, job: Job) {
 g.protagonist.job = job
 const key = skill[job]
 if (key) g.skills[key] = clamp(g.skills[key] + RETRAIN_SKILL_BONUS)
}

/**
 * Путь к следующему разряду по тем же правилам, что earnedGrade(). Чистая функция.
 * Если смена профессии оформлена, но ещё не рассчитана, условия показываются для новой специальности
 * (как они будут выглядеть после onJobChange), а не по стажу прежней.
 */
export function gradeProgress(g: GameState): GradeProgress {
 const job = g.protagonist.job
 let w = g.economy.work
 if (w.job !== job) { w = { ...w }; onJobChange(w, job, g.age + 1) }
 const key = skill[job] ?? null
 const rule = GRADE_RULES.find(r => r.from === w.grade)
 if (!key || !rule) return { job, skill: key, grade: w.grade, next: null, requirements: [], ready: false, work: w }
 const skillValue = g.skills[key]
 const years = g.age - (rule.since === 'job' ? w.jobSince : w.gradeSince)
 const requirements: GradeRequirement[] = [{ key: 'skill', current: skillValue, required: rule.skill, met: skillValue >= rule.skill }]
 if (rule.courses > 0) requirements.push({ key: 'courses', current: w.courses, required: rule.courses, met: w.courses >= rule.courses })
 requirements.push({ key: 'years', since: rule.since, current: Math.max(0, years), required: rule.years, met: years >= rule.years })
 return { job, skill: key, grade: w.grade, next: (rule.from + 1) as Grade, requirements, ready: requirements.every(r => r.met), work: w }
}

/** Разряд по квалификации на текущий возраст. Пока смена профессии не рассчитана, разряд не растёт. */
export function earnedGrade(g:GameState):Grade { const w=g.economy.work; if(w.job!==g.protagonist.job)return w.grade; const p=gradeProgress(g); return p.ready&&p.next!==null?p.next:w.grade }
export function pensionOf(w:Work):number {return Math.round(Math.max(360,Math.round(w.lastWage*(.2+.008*Math.min(w.service,40))))*(1+Math.min(.25,.04*w.deferYears)))}
export function obligationsOf(g:GameState) { const child=g.people.find(p=>p.id==='child' && p.alive && p.since<=g.age && p.age<16); return { essentials:(g.age>=18 ? ECONOMY_TUNING.personal-(g.protagonist.job==='Агроном'?60:0):0)+(child?150:0), rent:ECONOMY_TUNING.rent[g.economy.housing] } }
const servicesClosed = (g: GameState) => g.flags.shipIncidentAge === g.age || g.ship.air < 55 || g.ship.food < 45
const serviceCostOf = (g: GameState, id: string) => id === 'dome-pass' ? (g.protagonist.job === 'Агроном' ? 0 : ECONOMY_TUNING.services.domePass) : 0
/** Current annual obligations before affordability-driven cancellations; current closures waive services. */
export function annualObligationsOf(g: GameState): number {
 const { essentials, rent } = obligationsOf(g)
 return essentials + rent + (servicesClosed(g) ? 0 : Object.keys(g.economy.services).reduce((n, id) => n + serviceCostOf(g, id), 0))
}
/** null means no annual obligations: unbounded coverage, without division by zero or Infinity. */
export function reserveYearsOf(g: GameState): number | null {
 const bills = annualObligationsOf(g)
 return bills === 0 ? null : g.economy.balance / bills
}
export function recordEconomicTransaction(e:Economy,age:number,kind:string,amount:number,ref='',label=kind) {e.ledger.push({n:e.nextTxn++,age,kind,ref,label,amount});e.ledger=e.ledger.slice(-40)}
function txn(e:Economy,age:number,kind:string,amount:number) {recordEconomicTransaction(e,age,kind,amount)}
/** Мутирует только переданное состояние; вызывается один раз из tick. */
export function settleYear(g:GameState): {stats:{health?:number;stress?:number;morale?:number;bonds?:number}; logs:string[]} {
 const e=g.economy,w=e.work, stats:{health?:number;stress?:number;morale?:number;bonds?:number}={},logs:string[]=[]
 if(g.stopped || e.estate!==null || g.age<=e.settledAge)return {stats,logs}
 e.settledAge=g.age
 if(e.housingRight && g.age>e.housingRight.until)e.housingRight=null
 if(g.age===16 && w.kind==='child'){ w.kind='trainee';w.until=18; const n=ECONOMY_TUNING.start[g.birth.wealth]??0;e.balance+=n;txn(e,g.age,'start',n) }
 if(g.age>=18 && (w.kind==='child'||(w.kind==='trainee' && w.until!==null && g.age>=w.until))){w.kind='working';w.until=null;if(!isProfession(w.job)){w.jobSince=g.age;w.gradeSince=g.age}}
 if((w.kind==='between'||w.kind==='sick') && w.until!==null && g.age>w.until){w.kind='working';w.until=null}
 if(w.job!==g.protagonist.job)onJobChange(w,g.protagonist.job,g.age)
 if(g.flags.promotion==='accepted' && w.post==='none')w.post='held'
 const path=g.flags.retirementPath
 if(path==='left'||path==='mentor'||path==='continue')w.path=path
 // Старые сохранения отмечали все варианты retirement одним флагом; неизвестный исход = обычная пенсия.
 if(g.flags.retirement===true && path===undefined && w.path===null && g.age>=60)w.path='left'
 if(g.age>=77 && w.path===null)w.path='left'
 if(w.path==='left'||w.path==='mentor'||g.age>=77){
   if(w.post==='held')w.post='ended'
   w.kind='retired'
   w.mentor=w.path==='mentor' && g.age<=80
   if(g.age>=77)g.flags.retirement=true
 }
 let wage=0,pension=0; const tariff=wageOf(g)
 if(w.kind==='working'){w.lastWage=tariff; wage=Math.round(tariff*w.load*(1+(w.post==='held'?.1:0)+(g.focus==='work'?.08:0))*(1+(g.protagonist.job==='Техник'&&g.flags.shipIncidentAge===g.age?.12:0)))}
 if(w.kind==='trainee')wage=g.age<18?360:Math.round(tariff*.6)
 if(w.kind==='between')wage=Math.round(w.lastWage*.5)
 if(w.kind==='sick')wage=Math.round(tariff*.7)
 if(w.kind==='retired'){pension=pensionOf(w);if(w.mentor && g.age<=80)wage=Math.round(w.lastWage*.25)}
 let money=e.balance+wage+pension;const minimum=obligationsOf(g).essentials;const aid=Math.max(0,minimum-money);money=Math.max(0,money-minimum); if(aid){txn(e,g.age,'aid',aid);logs.push(`Фонд покрыл ${aid} кр.`)}
 let tight=aid>0; const paidServices:string[]=[]; const prior=e.housing;while(ECONOMY_TUNING.rent[e.housing]>money){e.housing=(e.housing-1) as Housing;tight=true}if(e.housing!==prior){e.housingRight={tier:prior as 1|2,until:g.age+3};logs.push('Жильё понижено до доступной ступени.')}
 const rent=e.lastBought['own-cabin']===g.age?0:ECONOMY_TUNING.rent[e.housing];money-=rent;let bills=minimum+rent
 const closed=servicesClosed(g)
 if(!closed) for(const id of Object.keys(e.services).sort()){
  const cost=serviceCostOf(g,id)
  if(cost>money){delete e.services[id];tight=true;logs.push(`Услуга ${id} отменена.`)}else{money-=cost;bills+=cost;paidServices.push(id)}
 }
 e.balance=money;e.tightStreak=tight?e.tightStreak+1:0;if(tight){stats.morale=-2;stats.stress=2}
 for(const id of paidServices)if(id==='dome-pass'){stats.stress=(stats.stress??0)-2;stats.morale=(stats.morale??0)+1}
 if(w.kind==='working'){
  w.service+=w.load
  // Отсрочка считает полные календарные годы, а стаж отдельно учитывает load.
  if(g.age>62)w.deferYears++
  if(g.age>=65 && w.load>=1){stats.health=-1;stats.stress=(stats.stress??0)+2}
  if(w.load<1){stats.stress=(stats.stress??0)-2;stats.bonds=1}
  const grade=earnedGrade(g)
  if(grade>w.grade){w.grade=grade;w.gradeSince=g.age;logs.push(`Новый тарифный разряд: ${grade}.`)}
 }
 e.totals.earned+=wage+pension;e.totals.spent+=bills-aid;e.totals.aid+=aid;e.years.push({age:g.age,wage,pension,bills,aid,balance:e.balance});e.years=e.years.slice(-80)
 return {stats,logs}
}
export interface YearProjection {
 projectedAge:number|null
 effects:ReturnType<typeof settleYear>
 economy:Economy
 pendingDecision:string|null
 assumptions:string[]
}
/**
 * Оценка одного следующего финансового года по текущему состоянию и известным регулярным обязательствам.
 * Не выбирает ожидающие сюжетные решения, не моделирует случайные события/аварии и не меняет исходную игру/RNG.
 */
export function projectYear(g:GameState):YearProjection {
 const copy=structuredClone(g)
 const assumptions=[
  'Учитываются текущие профессия, разряд, нагрузка, фокус, жильё и регулярные услуги, а также известные возрастные переходы.',
  'Не учитываются будущие сюжетные эффекты, случайные события, аварии и изменения показателей корабля.'
 ]
 if(g.pending)assumptions.push(`Ожидающее решение «${g.pending}» не выбрано и его последствия не учтены.`)
 if(g.moment)assumptions.push(`Активный момент «${g.moment}» не выбран и его последствия не учтены.`)
 if(copy.stopped||copy.economy.estate!==null){
  assumptions.push('Персонаж умер: будущие доходы и расчёты не прогнозируются.')
  return {projectedAge:null,effects:{stats:{},logs:[]},economy:copy.economy,pendingDecision:copy.pending,assumptions}
 }
 const effects=settleProjected(copy)
 return {projectedAge:copy.age,effects,economy:copy.economy,pendingDecision:copy.pending,assumptions}
}
/** Один прогнозный расчёт на копии: возраст героя и ребёнка, затем обычный settleYear(). */
function settleProjected(copy:GameState) {
 copy.age+=1
 const child=copy.people.find(person=>person.id==='child'&&person.alive)
 if(child)child.age+=1
 return settleYear(copy)
}
export interface ProjectedYear { age:number; row:YearRow; work:Work }
/**
 * Несколько годовых расчётов подряд с теми же допущениями, что projectYear(): без сюжетов, случайных событий
 * и роста навыков. Нужен, чтобы показать год стажировки и следующий за ним год. Исходную игру и RNG не меняет.
 */
export function projectYears(g:GameState,count:number):ProjectedYear[] {
 if(g.stopped||g.economy.estate!==null)return []
 const copy=structuredClone(g),out:ProjectedYear[]=[]
 for(let i=0;i<count;i++){settleProjected(copy);const row=copy.economy.years.at(-1);if(!row||row.age!==copy.age)break;out.push({age:copy.age,row:{...row},work:{...copy.economy.work}})}
 return out
}
export function closeEstate(g:GameState){if(g.economy.estate===null){g.economy.estate=g.economy.balance;txn(g.economy,g.age,'estate',g.economy.balance)}}
// Старые сохранения не содержат годовых данных о зарплате или курсах.
// Восстанавливаем только доступные факты: нынешнюю профессию и навык,
// стаж без покупок и расхода RNG. Старый retirement не различает исходы.
export function migrateEconomy(g: GameState): Economy {
  const e = initEconomy()
  const age = Math.max(0, Math.floor(g.age))
  const w = e.work
  w.job = g.protagonist.job
  w.jobSince = 18
  w.gradeSince = 18
  w.kind = age < 16 ? 'child' : age < 18 ? 'trainee' : g.flags.retirement || age >= 77 ? 'retired' : 'working'
  w.until = w.kind === 'trainee' ? 18 : null
  w.path = w.kind === 'retired' ? 'left' : null
  w.service = Math.max(0, Math.min(age, 77) - 17)
  const key = skill[w.job]
  if (key && g.skills[key] >= 18 && w.service >= 3) w.grade = 2
  // Курсы в старом формате неизвестны и принимаются равными нулю.
  w.lastWage = ECONOMY_TUNING.wages[w.job][w.grade - 1]!
  w.deferYears = w.kind === 'retired' && g.flags.retirement ? 0 : Math.max(0, Math.min(age, 76) - 62)
  w.post = g.flags.promotion === 'accepted' ? 'held' : 'none'
  let net = age >= 16 ? (ECONOMY_TUNING.start[g.birth.wealth] ?? 0) : 0
  for (let year = 16; year <= age; year++) {
    if (year < 18) net += ECONOMY_TUNING.trainee
    else {
      const income = year >= 77 ? pensionOf(w) : w.lastWage
      const needs = ECONOMY_TUNING.personal - (w.job === 'Агроном' ? 60 : 0)
      net += Math.max(0, income - needs)
    }
  }
  e.balance = Math.round(net * .25)
  e.settledAge = age
  if (g.stopped) e.estate = e.balance
  return e
}

/** Исправляет только экономику; неизвестные или испорченные поля не влияют на остальную жизнь. */
export function repairEconomy(g: GameState): Economy {
  const raw: unknown = g.economy
  const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
  const source = object(raw)
  if (source.v !== 1) return migrateEconomy(g)
  const base = migrateEconomy(g)
  const age = Math.max(0, Math.floor(g.age))
  const number = (v: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, v) : fallback
  const integer = (v: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) => Math.floor(number(v, fallback, max))
  const choice = <T extends string>(v: unknown, valid: readonly T[], fallback: T): T => valid.includes(v as T) ? v as T : fallback
  // T3 has not shipped an authoritative offer catalogue. Keep forward-compatible kebab-case IDs; discard malformed keys or dates only.
  const dates = (v: unknown) => Object.fromEntries(Object.entries(object(v)).filter(([key, value]) => /^[a-z0-9-]+$/.test(key) && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= age)) as Record<string, number>
  const srcWork = object(source.work), w = base.work
  w.job = choice(srcWork.job, Object.keys(ECONOMY_TUNING.wages) as Job[], g.protagonist.job)
  w.kind = choice(srcWork.kind, ['child','trainee','working','between','sick','retired'] as const, w.kind)
  if (age < 16) w.kind = 'child'
  else if (age < 18) w.kind = 'trainee'
  else if (w.kind === 'child' && Number(source.settledAge) >= 18 || w.kind === 'trainee' && (srcWork.until === null || srcWork.until === undefined || Number(srcWork.until) <= age)) w.kind = 'working'
  if (age >= 77 && w.kind !== 'retired') w.kind = 'retired'
  if (age < 60 && w.kind === 'retired') { w.kind = 'working'; w.path = null; w.mentor = false }
  if (age >= 60 && w.kind === 'retired' && !['left','mentor','continue'].includes(String(srcWork.path))) w.path = g.flags.retirement ? 'left' : 'left'
  if (w.kind === 'working' && (w.path === 'left' || w.path === 'mentor')) w.kind = 'retired'
  if (w.path === 'continue' && age < 77) w.kind = 'working'
  if ((w.kind === 'between' || w.kind === 'sick') && age < 18) w.kind = age < 16 ? 'child' : 'trainee'
  if ((w.kind === 'between' || w.kind === 'sick') && typeof srcWork.until === 'number' && srcWork.until < age) { w.kind = 'working'; w.until = null }
  w.load = srcWork.load === .6 ? .6 : 1
  w.grade = srcWork.grade === 1 || srcWork.grade === 2 || srcWork.grade === 3 || srcWork.grade === 4 ? srcWork.grade : base.work.grade
  w.jobSince = age < 18 ? 18 : Math.min(age, integer(srcWork.jobSince, w.jobSince, age))
  w.gradeSince = age < 18 ? 18 : Math.max(w.jobSince, Math.min(age, integer(srcWork.gradeSince, w.gradeSince, age)))
  w.courses = integer(srcWork.courses, 0, 100)
  w.service = number(srcWork.service, w.service, Math.max(0, age - 16))
  w.lastWage = Number.isSafeInteger(srcWork.lastWage) && (srcWork.lastWage as number) >= 360 && (srcWork.lastWage as number) <= 3000 ? srcWork.lastWage as number : ECONOMY_TUNING.wages[w.job][w.grade - 1]!
  w.until = srcWork.until === undefined ? w.until : srcWork.until === null ? null : integer(srcWork.until, age, 120)
  // Взрослая стажировка (переобучение) длится ровно один расчётный год: повреждённый срок не продлевает её.
  if (w.kind === 'trainee' && age >= 18 && (w.until === null || w.until > age + 1)) w.until = age + 1
  w.path = srcWork.path === undefined ? w.path : srcWork.path === null ? null : choice(srcWork.path, ['left','mentor','continue'] as const, w.path ?? (w.kind === 'retired' ? 'left' : 'continue'))
  const hasRetirementPath = g.flags.retirementPath === 'left' || g.flags.retirementPath === 'mentor' || g.flags.retirementPath === 'continue'
  // Economy v1 saves made before retirementPath existed only recorded retirement=true.
  if (age >= 60 && age < 77 && g.flags.retirement === true && !hasRetirementPath && w.path === null) w.path = 'left'
  if (age >= 77 && w.path === null) w.path = 'left'
  if (w.path === 'left' || w.path === 'mentor') w.kind = age >= 60 ? 'retired' : 'working'
  if (w.path === 'continue' && age < 77) w.kind = 'working'
  if (age >= 77) w.kind = 'retired'
  w.deferYears = integer(srcWork.deferYears, w.deferYears, age)
  w.mentor = w.path === 'mentor' && srcWork.mentor === true && w.kind === 'retired' && age <= 80
  if (w.path === 'mentor' && age <= 80 && w.kind === 'retired') w.mentor = true
  if (w.kind === 'retired' && w.path === 'continue') w.mentor = false
  w.post = choice(srcWork.post, ['none','held','ended'] as const, w.post)
  base.balance = integer(source.balance, base.balance)
  base.housing = integer(source.housing, 0, 2) as Housing
  const right = object(source.housingRight)
  base.housingRight = (right.tier === 1 || right.tier === 2) && right.tier > base.housing && typeof right.until === 'number' && Number.isInteger(right.until) && right.until >= age && right.until <= age + 3 ? {tier:right.tier, until:right.until} : null
  base.services = dates(source.services)
  base.owned = dates(source.owned)
  base.lastBought = dates(source.lastBought)
  base.goal = typeof source.goal === 'string' && /^[a-z0-9-]+$/.test(source.goal) ? source.goal : null
  base.tightStreak = integer(source.tightStreak, 0, age)
  // При повреждённом маркере считаем текущий год закрытым: повторная выплата хуже пропуска.
  base.settledAge = integer(source.settledAge, age, age)
  const row = (v: unknown): YearRow | null => { const r=object(v); const fields=['wage','pension','bills','aid','balance']; if (!Number.isInteger(r.age) || (r.age as number)<0 || (r.age as number)>age || fields.some(k=>!Number.isSafeInteger(r[k]) || (r[k] as number)<0) || (r.aid as number)>(r.bills as number)) return null; return { age:r.age as number, wage:r.wage as number, pension:r.pension as number, bills:r.bills as number, aid:r.aid as number, balance:r.balance as number } }
  base.years = Array.isArray(source.years) ? source.years.map(row).filter((r): r is YearRow => r !== null).sort((a,b)=>a.age-b.age).filter((r,i,rows)=>i===rows.findIndex(x=>x.age===r.age)).slice(-80) : []
  const validKinds = ['start','purchase','story-expense','gift','help','windfall','shock','aid','estate']
  const validStoryExpense = (t: Record<string, unknown>) => t.kind !== 'story-expense' ||
    typeof t.ref === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.ref) && typeof t.label === 'string' && t.label.length > 0 &&
    Number.isSafeInteger(t.amount) && (t.amount as number) > 0 && (t.amount as number) <= 1500
  const txnIds = new Set<number>()
  base.ledger = Array.isArray(source.ledger) ? source.ledger.flatMap((entry: unknown) => { const t=object(entry); if (!validKinds.includes(String(t.kind)) || !validStoryExpense(t) || !Number.isSafeInteger(t.age) || (t.age as number)<0 || (t.age as number)>age || !Number.isSafeInteger(t.amount) || (t.amount as number)<0 || !Number.isSafeInteger(t.n) || (t.n as number)<1 || txnIds.has(t.n as number)) return []; txnIds.add(t.n as number); return [{ n:t.n as number, age:t.age as number, kind:String(t.kind), ref:typeof t.ref==='string' && /^[a-z0-9-]*$/.test(t.ref)?t.ref:'', label:typeof t.label==='string'?t.label:'', amount:t.amount as number }] }).slice(-40) : []
  base.nextTxn = Math.max(1, integer(source.nextTxn,1), ...base.ledger.map(t=>t.n+1))
  const totals=object(source.totals)
  const fromYears=(select:(r:YearRow)=>number)=>base.years.reduce((sum,r)=>Math.min(Number.MAX_SAFE_INTEGER,sum+select(r)),0)
  const recentPurchases=base.ledger.filter(t=>t.kind==='purchase'||t.kind==='story-expense').reduce((sum,t)=>Math.min(Number.MAX_SAFE_INTEGER,sum+t.amount),0)
  const recentWindfalls=base.ledger.filter(t=>t.kind==='windfall').reduce((sum,t)=>Math.min(Number.MAX_SAFE_INTEGER,sum+t.amount),0)
  base.totals={earned:Math.max(integer(totals.earned,0),Math.min(Number.MAX_SAFE_INTEGER,fromYears(r=>r.wage+r.pension)+recentWindfalls)),spent:Math.max(integer(totals.spent,0),Math.min(Number.MAX_SAFE_INTEGER,fromYears(r=>r.bills-r.aid)+recentPurchases)),given:integer(totals.given,0),aid:Math.max(integer(totals.aid,0),fromYears(r=>r.aid))}
  base.estate = g.stopped ? integer(source.estate,base.balance) : null
  return base
}
