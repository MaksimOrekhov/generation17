import { describe, expect, it } from 'vitest'
import { createGame, decide } from '../engine'
import { repairSave } from '../save'
import { earnedGrade, settleYear } from '../economy'
import type { GameState, Job } from '../types'

const trackChoice: Record<string,number> = {'Техник':0,'Медик':1,'Агроном':2,'Координатор':3}
function specialistAt(age:number, job:Job='Техник') {
  const g=createGame(741)
  g.age=16;g.economy.settledAge=15;g.economy.work.kind='trainee';g.economy.work.until=18
  g.pending='school-track'
  let state=decide(g,trackChoice[job]!)
  state.age=17;settleYear(state)
  for(let year=18;year<=age;year++){state.age=year;settleYear(state)}
  return state
}
function switchProfession(g:GameState) {
  g.pending='mentor';g.flags.trackChosen=true;g.flags.mentorTalk=false
  return decide(g,0)
}

describe('переходы профессии и тарифные разряды',()=>{
  it('первый выбор специальности не считается переобучением, а стаж начинается до полной работы',()=>{
    const g=specialistAt(18)
    expect(g.protagonist.job).toBe('Техник')
    expect(g.economy.work.kind).toBe('working')
    expect(g.economy.work.grade).toBe(1)
    expect(g.economy.work.jobSince).toBe(16)
    expect(g.economy.work.service).toBe(1)
  })
  it.each([25,35,55])('переобучение в возрасте %i сбрасывает данные профессии, сохраняя общий стаж',age=>{
    const g=specialistAt(age-1)
    g.economy.work.grade=3;g.economy.work.courses=2;g.economy.work.post='held';g.flags.promotion='accepted'
    const service=g.economy.work.service
    const changed=switchProfession(g)
    expect(changed.protagonist.job).toBe('Медик') // существующий effect «Переобучение»
    expect(changed.skills.medicine).toBe(9)
    changed.age=age;const result=settleYear(changed)
    expect(changed.economy.work).toMatchObject({kind:'trainee',until:age+1,grade:2,courses:0,post:'ended',service})
    expect(changed.economy.years.at(-1)?.wage).toBe(Math.round(1300*.6))
    expect(result.logs).not.toContain('Новый тарифный разряд: 3.')
    changed.age=age+1;settleYear(changed)
    expect(changed.economy.work.kind).toBe('working')
    expect(changed.economy.work.service).toBe(service+1)
    expect(changed.economy.work.jobSince).toBe(age)
  })
  it.each([1,2,3,4] as const)('смена профессии с разряда %i снижает ровно на одну ступень',grade=>{
    const g=specialistAt(34);g.economy.work.grade=grade;g.economy.work.courses=3
    const changed=switchProfession(g);changed.age=35;settleYear(changed)
    expect(changed.economy.work.grade).toBe(Math.max(1,grade-1))
  })
  it.each([
    ['I→II',1,18,0,3,2],['II→III',2,45,1,10,3],['III→IV',3,60,2,8,4]
  ] as const)('%s требует полный набор условий и повышается на одну ступень',(_name,grade,skill,courses,tenure,expected)=>{
    const g=specialistAt(40);g.economy.work.kind='working';g.economy.work.grade=grade;g.economy.work.courses=courses;g.economy.work.jobSince=g.age-tenure;g.economy.work.gradeSince=g.age-(grade===3?8:0);g.skills.engineering=skill
    expect(earnedGrade(g)).toBe(expected)
    g.skills.engineering=skill-1
    expect(earnedGrade(g)).toBe(grade)
  })
  it('переход IV→III требует именно восьмилетний стаж в разряде III',()=>{
    const g=specialistAt(45);g.economy.work.grade=3;g.economy.work.courses=2;g.economy.work.jobSince=35;g.economy.work.gradeSince=37;g.skills.engineering=60
    expect(earnedGrade(g)).toBe(4)
    g.economy.work.gradeSince=37
    expect(earnedGrade(g)).toBe(4)
  })
  it('повышает только на одну ступень за год, не повторяет журнал, назначение разряд не меняет',()=>{
    const g=specialistAt(40);g.economy.work.grade=1;g.economy.work.jobSince=20;g.skills.engineering=60;g.economy.work.courses=3;g.flags.promotion='accepted'
    g.age++;const rng=g.rng;const result=settleYear(g)
    expect(g.economy.work.grade).toBe(2);expect(g.economy.work.post).toBe('held');expect(g.rng).toBe(rng)
    expect(result.logs.filter(x=>x.includes('разряд'))).toHaveLength(1)
    const before=structuredClone(g.economy);expect(settleYear(g).logs).toEqual([]);expect(g.economy).toEqual(before);expect(g.rng).toBe(rng)
  })
  it('отказ в назначении не закрывает повышение, а надбавка после смены не возобновляется',()=>{
    const g=specialistAt(40);g.economy.work.grade=1;g.economy.work.jobSince=20;g.skills.engineering=18;g.flags.promotion='declined'
    g.age++;settleYear(g);expect(g.economy.work.grade).toBe(2);expect(g.economy.work.post).toBe('none')
    g.economy.work.post='ended';g.flags.promotion='accepted';g.economy.work.job='Медик';g.protagonist.job='Агроном';g.age++;settleYear(g)
    expect(g.economy.work.post).toBe('ended')
  })
  it('сохранение во время переобучения загружается без повторного начисления',()=>{
    const g=specialistAt(34);const changed=switchProfession(g);changed.age=35;settleYear(changed)
    const restored=repairSave(JSON.parse(JSON.stringify(g)) as GameState).game
    const before=structuredClone(restored.economy);const rng=restored.rng
    settleYear(restored);expect(restored.economy).toEqual(before);expect(restored.rng).toBe(rng)
    restored.age=36;settleYear(restored);expect(restored.economy.work.kind).toBe('working')
  })
  it('одинаковая последовательность эффектов даёт одинаковую экономику и RNG не расходуется расчётом',()=>{
    const a=specialistAt(30);const b=structuredClone(a);const oldRng=a.rng
    const da=switchProfession(a),db=switchProfession(b);da.age++;db.age++
    settleYear(da);settleYear(db)
    expect(da.economy).toEqual(db.economy);expect(da.rng).toBe(oldRng);expect(db.rng).toBe(oldRng)
  })
  it('назначение влияет только на текущую оплату и не входит в пенсионную тарифную базу',()=>{
    const g=specialistAt(30);g.economy.work.post='held';g.flags.promotion='accepted';g.age++
    settleYear(g)
    expect(g.economy.years.at(-1)?.wage).toBe(Math.round(1100*1.1))
    expect(g.economy.work.lastWage).toBe(1100)
  })
  it('одно только назначение не даёт разряд без квалификационных условий',()=>{
    const g=specialistAt(30);g.economy.work.grade=1;g.economy.work.jobSince=20;g.skills.engineering=17;g.flags.promotion='accepted';g.age++
    settleYear(g)
    expect(g.economy.work.post).toBe('held');expect(g.economy.work.grade).toBe(1)
  })

})
