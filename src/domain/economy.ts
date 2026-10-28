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
const isProfession = (job: Job) => job === 'Техник' || job === 'Медик' || job === 'Агроном' || job === 'Координатор'
export function initEconomy():Economy { return {v:1,balance:0,work:{kind:'child',load:1,grade:1,jobSince:18,gradeSince:18,courses:0,service:0,lastWage:650,until:null,path:null,deferYears:0,mentor:false,post:'none',job:'Ученик'},housing:0,housingRight:null,services:{},owned:{},lastBought:{},goal:null,tightStreak:0,settledAge:0,years:[],ledger:[],nextTxn:1,totals:{earned:0,spent:0,given:0,aid:0},estate:null} }
export function wageOf(g:GameState):number { const w=g.economy.work; return ECONOMY_TUNING.wages[g.protagonist.job][w.grade-1]! }
export function earnedGrade(g:GameState):Grade { const w=g.economy.work; const key=skill[g.protagonist.job]; if(!key)return w.grade; const n=g.skills[key]; if(w.grade===1 && n>=18 && g.age-w.jobSince>=3)return 2; if(w.grade===2 && n>=45 && w.courses>=1 && g.age-w.jobSince>=10)return 3; if(w.grade===3 && n>=60 && w.courses>=2 && g.age-w.gradeSince>=8)return 4; return w.grade }
export function pensionOf(w:Work):number {return Math.round(Math.max(360,Math.round(w.lastWage*(.2+.008*Math.min(w.service,40))))*(1+Math.min(.25,.04*w.deferYears)))}
export function obligationsOf(g:GameState) { const child=g.people.find(p=>p.id==='child' && p.alive && p.since<=g.age && p.age<16); return { essentials:(g.age>=18 ? ECONOMY_TUNING.personal-(g.protagonist.job==='Агроном'?60:0):0)+(child?150:0), rent:ECONOMY_TUNING.rent[g.economy.housing] } }
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
 if(w.job!==g.protagonist.job){
   const retraining = isProfession(w.job)
   if(retraining){
     w.grade=Math.max(1,w.grade-1) as Grade
     w.courses=0
     if(w.post==='held')w.post='ended'
     w.kind='trainee'
     w.until=g.age+1
   }
   w.job=g.protagonist.job
   // Сюжет смены профессии уже изменил навык; экономика отвечает только за карьерное состояние.
   w.jobSince=retraining?g.age:Math.max(16,g.age-1)
   w.gradeSince=g.age
 }
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
 const closed=g.flags.shipIncidentAge===g.age || g.ship.air<55 || g.ship.food<45
 if(!closed) for(const id of Object.keys(e.services).sort()){
  const cost=id==='dome-pass'?(g.protagonist.job==='Агроном'?0:ECONOMY_TUNING.services.domePass):0
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
 copy.age+=1
 const child=copy.people.find(person=>person.id==='child'&&person.alive)
 if(child)child.age+=1
 const effects=settleYear(copy)
 return {projectedAge:copy.age,effects,economy:copy.economy,pendingDecision:copy.pending,assumptions}
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
  else if (w.kind === 'child' && Number(source.settledAge) >= 18 || w.kind === 'trainee' && (srcWork.until === null || srcWork.until === undefined || Number(srcWork.until) < age)) w.kind = 'working'
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
  const validKinds = ['start','purchase','gift','help','windfall','shock','aid','estate']
  const txnIds = new Set<number>()
  base.ledger = Array.isArray(source.ledger) ? source.ledger.flatMap((entry: unknown) => { const t=object(entry); if (!validKinds.includes(String(t.kind)) || !Number.isSafeInteger(t.age) || (t.age as number)<0 || (t.age as number)>age || !Number.isSafeInteger(t.amount) || (t.amount as number)<0 || !Number.isSafeInteger(t.n) || (t.n as number)<1 || txnIds.has(t.n as number)) return []; txnIds.add(t.n as number); return [{ n:t.n as number, age:t.age as number, kind:String(t.kind), ref:typeof t.ref==='string' && /^[a-z0-9-]*$/.test(t.ref)?t.ref:'', label:typeof t.label==='string'?t.label:'', amount:t.amount as number }] }).slice(-40) : []
  base.nextTxn = Math.max(1, integer(source.nextTxn,1), ...base.ledger.map(t=>t.n+1))
  const totals=object(source.totals)
  const fromYears=(select:(r:YearRow)=>number)=>base.years.reduce((sum,r)=>Math.min(Number.MAX_SAFE_INTEGER,sum+select(r)),0)
  const recentPurchases=base.ledger.filter(t=>t.kind==='purchase').reduce((sum,t)=>Math.min(Number.MAX_SAFE_INTEGER,sum+t.amount),0)
  base.totals={earned:Math.max(integer(totals.earned,0),fromYears(r=>r.wage+r.pension)),spent:Math.max(integer(totals.spent,0),fromYears(r=>r.bills-r.aid)+recentPurchases),given:integer(totals.given,0),aid:Math.max(integer(totals.aid,0),fromYears(r=>r.aid))}
  base.estate = g.stopped ? integer(source.estate,base.balance) : null
  return base
}
