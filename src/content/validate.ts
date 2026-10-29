import { CONTENT_PEOPLE, mentionedPeople } from '../domain/contentPeople'
import registrations from '../../content/lines.json'
import categoryRegistrations from '../../content/categories.json'
import compatibility from '../../content/compatibility.json'
import { MAX_REQUIRES_DEPTH } from './load'
import type { Effects, MomentDef, Storylet } from '../domain/types'
import { getOffer } from '../domain/offers'
import { TIME_REGIMES } from '../domain/personalTime'
import { STORY_MONEY_LIMIT, validStoryMoney } from '../domain/storyMoney'
import { STORY_PERSON_ROLES, STORY_PERSON_SLOTS } from '../domain/people'

export interface Issue { level: 'error' | 'warn'; where: string; message: string }

export const STATS = ['health', 'morale', 'stress', 'knowledge', 'bonds', 'reputation']
export const SHIP_STATS = ['air', 'food', 'cohesion', 'hull']
export const SKILLS = ['engineering', 'medicine', 'ecology', 'social']
export const JOBS = ['Ученик', 'Техник', 'Медик', 'Агроном', 'Координатор', 'Без специальности']
export const SPOTS = ['window', 'door', 'terminal', 'parent', 'table', 'plant']
export const PEOPLE: readonly string[] = CONTENT_PEOPLE
export const SECTORS = ['atrium', 'bio', 'engineering', 'clinic', 'lower']
/** Люди, которых эффект `addPerson` может добавить в жизнь героя. */
export const NEW_PEOPLE = ['child']
/** Подстановки {{...}}, которые понимает resolveText. */
export const PLACEHOLDERS: readonly string[] = ['name', 'job', ...CONTENT_PEOPLE]
/** Подстановки-люди: должны быть гарантированы заголовком (body у сюжета, needs у момента). */
const PERSON_PLACEHOLDERS: readonly string[] = CONTENT_PEOPLE
/** Кого можно указывать в формах по роду: `{{hero:ся|ась}}`. */
export const GENDER_SUBJECTS = ['hero', ...PERSON_PLACEHOLDERS]
/** Сюжетный выбор может по-настоящему купить только эти позиции каталога (T7). */
export const STORY_PURCHASE_OFFERS = ['course-pro', 'family-trip']
/** Флаги, которые ставит сам движок, а не эффекты сюжетов: семейная поездка отмечает возраст поездки с каждым участником. */
const ENGINE_FLAGS = ['familyHealthRisk', 'familyTrip', ...PEOPLE.map(id => `familyTrip${id.charAt(0).toUpperCase()}${id.slice(1)}`)]

export const LIMITS = {
  age: [0, 95], weight: [1, 8], choices: [2, 4],
  title: [3, 40], body: [60, 420], bodyWarn: 320, result: [20, 260], resultWarn: 200,
  momentText: [30, 260], momentTextWarn: 200, label: [3, 40], hint: [3, 50], memory: [10, 140],
  stat: 10, statWarn: 8, ship: 6, skill: 4, bond: 18, cooldown: [1, 12],
  money: STORY_MONEY_LIMIT, reserveYears: [0, 1000]
} as const

export interface Known {
  storyletIds: Set<string>
  momentIds: Set<string>
  flags: Set<string>
  arcs: Set<string>
  categories: Set<string>
  choices?: Map<string, Set<string>>
}

type EffectHolder = { effects?: Effects; check?: { success: Effects; failure: Effects } }

export function collectKnown(storylets: Storylet[], moments: MomentDef[], lines: unknown = registrations, categories: unknown = categoryRegistrations): Known {
  const flags = new Set<string>(ENGINE_FLAGS)
  const add = (e?: Effects) => Object.keys(e?.flags ?? {}).forEach(k => flags.add(k))
  const addHolder = (c: EffectHolder) => { add(c.effects); add(c.check?.success); add(c.check?.failure) }
  for (const s of storylets) s.choices.forEach(addHolder)
  for (const m of moments) { add(m.accept.effects); add(m.skip.effects) }
  return {
    storyletIds: new Set(storylets.map(s => s.id)),
    momentIds: new Set(moments.map(m => m.id)),
    flags,
    arcs: new Set([...storylets.map(s => s.arc).filter((a): a is string => !!a), ...(Array.isArray(lines) ? lines.flatMap(r => isObj(r) && isStr(r.id) ? [r.id] : []) : [])]),
    categories: new Set([...storylets.map(s => s.category), ...(Array.isArray(categories) ? categories.flatMap(r => isObj(r) && isStr(r.id) ? [r.id] : []) : [])]),
    choices: new Map(storylets.map(s => [s.id, new Set(s.choices.flatMap(c => c.id ? [c.id] : []))]))
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
type Range = readonly [number, number]

class Ctx {
  issues: Issue[] = []
  constructor(readonly known: Known) {}
  err(where: string, message: string) { this.issues.push({ level: 'error', where, message }) }
  warn(where: string, message: string) { this.issues.push({ level: 'warn', where, message }) }

  keys(o: Obj, allowed: string[], where: string) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.err(where, `неизвестное поле «${k}» (допустимы: ${allowed.join(', ')})`)
  }

  text(v: unknown, where: string, range: Range, warnAt?: number): v is string {
    if (!isStr(v)) { this.err(where, 'должна быть строка'); return false }
    if (v.length < range[0] || v.length > range[1]) this.err(where, `длина ${v.length}, нужно ${range[0]}–${range[1]} символов`)
    else if (warnAt && v.length > warnAt) this.warn(where, `длинный текст (${v.length}), лучше до ${warnAt}`)
    if (v !== v.trim()) this.err(where, 'пробелы в начале или конце')
    if (/\s{2,}/.test(v)) this.err(where, 'двойные пробелы или переносы строк внутри текста')
    if (/[a-zA-Z]{3,}/.test(v.replace(/\{\{\w+(:[^{}]*)?\}\}/g, ''))) this.warn(where, 'латиница в тексте — точно нужна?')
    const forms = [...v.matchAll(/\{\{(\w+):([^|{}]*)\|([^|{}]*)\}\}/g)]
    for (const f of forms) {
      if (!GENDER_SUBJECTS.includes(f[1])) this.err(where, `форма рода {{${f[1]}:…}}: кто — один из ${GENDER_SUBJECTS.join(', ')}`)
      if (!f[2] && !f[3]) this.err(where, `форма рода {{${f[1]}:|}} пуста`)
    }
    if ((v.match(/\{\{\w+:/g) ?? []).length !== forms.length) this.err(where, 'форма рода записывается так: {{кто:мужская|женская}}, например Заступил{{hero:ся|ась}}')
    // формы по роду собирают слово, поэтому для эвристики считаем их буквой
    // \b в JS не видит кириллицу, поэтому границы слов заданы через lookaround
    if (/(?<![а-яё])ты\s+(?:\S+\s+)?[а-яё]+(?:лся|лась|ла|л)(?![а-яё])/i.test(v.replace(/\{\{\w+:[^}]*\}\}/g, 'я'))) this.warn(where, 'возможно, форма рода у героя без разметки: напишите Заступил{{hero:ся|ась}} (первая форма мужская, вторая женская) или перепишите в настоящем времени')
    if ((v.match(/\{\{/g) ?? []).length !== (v.match(/\}\}/g) ?? []).length) this.err(where, 'незакрытая подстановка {{…}}')
    for (const m of v.matchAll(/\{\{(\w*)\}\}/g)) {
      if (!PLACEHOLDERS.includes(m[1])) this.err(where, `неизвестная подстановка {{${m[1]}}} (есть: ${PLACEHOLDERS.join(', ')})`)
    }
    return true
  }

  numberRange(value: unknown, where: string, min: number, max: number) {
    if (!isObj(value)) { this.err(where, 'нужен объект {min?, max?}'); return }
    this.keys(value, ['min', 'max'], where)
    if (value.min === undefined && value.max === undefined) this.err(where, 'нужна хотя бы одна граница')
    for (const bound of ['min', 'max']) if (value[bound] !== undefined) this.int(value[bound], `${where}.${bound}`, [min, max])
    if (isNum(value.min) && isNum(value.max) && value.min > value.max) this.err(where, 'min больше max')
  }

  variants(value: unknown, where: string, range: Range, guaranteed: string[], flags: Set<string>, warnAt?: number) {
    if (value === undefined) return
    if (!Array.isArray(value) || !value.length || value.length > 32) { this.err(where, 'нужно 1–32 вариантов текста'); return }
    value.forEach((v, i) => {
      const w = `${where}[${i}]`
      if (!isObj(v)) { this.err(w, 'нужен объект {requires, text}'); return }
      this.keys(v, ['requires', 'text'], w)
      if (!isObj(v.requires)) this.err(`${w}.requires`, 'условие варианта обязательно')
      this.requires(v.requires, `${w}.requires`, flags)
      if (this.text(v.text, `${w}.text`, range, warnAt)) this.personGuard(v.text, [...guaranteed, ...guardedPeople(v.requires)], `${w}.text`)
    })
  }

  int(v: unknown, where: string, range: Range) {
    if (!isNum(v) || !Number.isInteger(v)) this.err(where, 'должно быть целое число')
    else if (v < range[0] || v > range[1]) this.err(where, `${v} вне диапазона ${range[0]}–${range[1]}`)
  }

  personStates(value: unknown, where: string) {
    if (!isObj(value) || !Object.keys(value).length) { this.err(where, 'нужна карта людей и их состояний'); return }
    for (const [ref, state] of Object.entries(value)) {
      if (!['friend', 'child', 'partner', 'formerPartner', ...STORY_PERSON_SLOTS].includes(ref)) this.err(`${where}.${ref}`, 'неизвестная ссылка на человека')
      if (!isObj(state) || !Object.keys(state).length) { this.err(`${where}.${ref}`, 'нужен непустой объект состояния'); continue }
      this.keys(state, ['sectorId', 'job', 'availability', 'familyStatus'], `${where}.${ref}`)
      if (state.sectorId !== undefined && !SECTORS.includes(state.sectorId as string)) this.err(`${where}.${ref}.sectorId`, 'неизвестный сектор')
      if (state.job !== undefined && !JOBS.includes(state.job as string)) this.err(`${where}.${ref}.job`, 'неизвестная профессия')
      if (state.availability !== undefined && !['available', 'distant'].includes(state.availability as string)) this.err(`${where}.${ref}.availability`, 'неизвестная доступность')
      if (state.familyStatus !== undefined && !['unknown', 'single', 'family'].includes(state.familyStatus as string)) this.err(`${where}.${ref}.familyStatus`, 'неизвестное семейное положение')
    }
  }

  effects(e: unknown, where: string, allowExpense = true) {
    if (!isObj(e)) { this.err(where, 'effects должен быть объектом (может быть пустым {})'); return }
    this.keys(e, ['stats', 'ship', 'skills', 'bonds', 'flags', 'job', 'memory', 'addPerson', 'moveTo', 'money', 'person', 'relationship', 'cohabit'], where)
    if (e.cohabit !== undefined && !['hero', 'partner', 'apart'].includes(e.cohabit as string)) this.err(`${where}.cohabit`, 'неизвестный вариант совместной жизни')
    if (e.money !== undefined) {
      if (!validStoryMoney(e.money)) this.err(`${where}.money`, `нужно безопасное целое число в пределах ±${LIMITS.money}`)
      else if (!allowExpense && e.money < 0) this.err(`${where}.money`, 'отрицательные деньги здесь запрещены')
    }
    const nums = (key: string, names: readonly string[], limit: number, warnAt?: number) => {
      const o = e[key]
      if (o === undefined) return
      if (!isObj(o)) { this.err(`${where}.${key}`, 'должен быть объектом'); return }
      for (const [k, v] of Object.entries(o)) {
        const w = `${where}.${key}.${k}`
        if (!names.includes(k)) this.err(w, `неизвестный ключ (есть: ${names.join(', ')})`)
        else if (!isNum(v) || !Number.isInteger(v)) this.err(w, 'должно быть целое число')
        else if (Math.abs(v) > limit) this.err(w, `изменение ${v} больше допустимого ±${limit}`)
        else if (warnAt && Math.abs(v) > warnAt) this.warn(w, `сильное изменение ${v}, баланс проверит Claude`)
      }
    }
    nums('stats', STATS, LIMITS.stat, LIMITS.statWarn)
    nums('ship', SHIP_STATS, LIMITS.ship)
    nums('skills', SKILLS, LIMITS.skill)
    nums('bonds', PEOPLE, LIMITS.bond)
    if (e.flags !== undefined) {
      if (!isObj(e.flags)) this.err(`${where}.flags`, 'должен быть объектом')
      else {
        for (const [k, v] of Object.entries(e.flags)) {
          if (!/^[a-z][A-Za-z0-9]*$/.test(k)) this.err(`${where}.flags.${k}`, 'имя флага — camelCase латиницей')
          if (!(isStr(v) || isNum(v) || typeof v === 'boolean')) this.err(`${where}.flags.${k}`, 'значение — строка, число или true/false ("@age" = текущий возраст)')
        }
      }
    }
    if (e.job !== undefined && !(e.job === 'Переобучение' || JOBS.includes(e.job as string))) this.err(`${where}.job`, 'неизвестная профессия')
    if (e.addPerson !== undefined && e.addPerson !== 'child') {
      if (!isObj(e.addPerson)) this.err(`${where}.addPerson`, 'нужен объявленный слот')
      else {
        this.keys(e.addPerson, ['slot', 'role'], `${where}.addPerson`)
        if (!STORY_PERSON_SLOTS.includes(e.addPerson.slot as string) || !isStr(e.addPerson.role) || !Object.hasOwn(STORY_PERSON_ROLES, e.addPerson.role)) this.err(`${where}.addPerson`, 'недопустимый слот или роль')
      }
    }
    if (e.person !== undefined) this.personStates(e.person, `${where}.person`)
    if (e.relationship !== undefined) {
      if (!isObj(e.relationship)) this.err(`${where}.relationship`, 'нужен объект действия')
      else {
        this.keys(e.relationship, ['action', 'person'], `${where}.relationship`)
        if (e.relationship.action === 'start' ? !['friend', ...STORY_PERSON_SLOTS].includes(e.relationship.person as string) : e.relationship.action !== 'end' || e.relationship.person !== undefined) this.err(`${where}.relationship`, 'недопустимое действие отношений')
      }
    }
    if (e.moveTo !== undefined && ![...SECTORS, 'partner'].includes(e.moveTo as string)) this.err(`${where}.moveTo`, `сектор из: ${SECTORS.join(', ')} или partner`)
    if (e.memory !== undefined) this.text(e.memory, `${where}.memory`, LIMITS.memory)
  }

  requires(r: unknown, where: string, flagsSetHere: Set<string>, depth = 0) {
    if (depth > MAX_REQUIRES_DEPTH) { this.err(where, 'глубина requires больше 8'); return }
    if (r === undefined) return
    if (!isObj(r)) { this.err(where, 'requires должен быть объектом'); return }
    this.keys(r, ['flag', 'flagNot', 'flagIs', 'flagNotIs', 'since', 'until', 'personAge', 'person', 'childStage', 'focus', 'job', 'alive', 'present', 'stat', 'sector', 'sectorNot', 'money', 'work', 'grade', 'housing', 'owns', 'ownsNot', 'reserveYears', 'ownedYears', 'servicesOpen', 'regime', 'any', 'seen', 'notSeen', 'chose', 'decisionYears', 'bond', 'skill', 'ship', 'birthWealth', 'trait', 'dead', 'absent', 'exists'], where)
    if (r.focus !== undefined && (!Array.isArray(r.focus) || !r.focus.length || !r.focus.every(x => ['study', 'relationships', 'work', 'rest', 'civic'].includes(x as string)))) this.err(`${where}.focus`, 'неизвестный жизненный фокус')
    if (r.person !== undefined) this.personStates(r.person, `${where}.person`)
    if (r.childStage !== undefined && (!Array.isArray(r.childStage) || !r.childStage.length || !r.childStage.every(x => ['early-childhood', 'school-age', 'youth', 'adult'].includes(x as string)))) this.err(`${where}.childStage`, 'неизвестная стадия ребёнка')
    if (r.any !== undefined) {
      if (!Array.isArray(r.any) || !r.any.length || r.any.length > 32) this.err(`${where}.any`, 'нужен непустой массив из 1–32 условий')
      else r.any.forEach((child, i) => this.requires(child, `${where}.any[${i}]`, flagsSetHere, depth + 1))
    }
    for (const key of ['seen', 'notSeen', 'dead', 'absent', 'exists', 'trait']) {
      const v = r[key]
      if (v === undefined) continue
      if (!Array.isArray(v) || !v.length || !v.every(isStr)) { this.err(`${where}.${key}`, 'нужен непустой массив строк'); continue }
      const names = key === 'seen' || key === 'notSeen' ? this.known.storyletIds
        : key === 'trait' ? new Set(['Наблюдательный', 'Осторожный', 'Любознательный', 'Упрямый', 'Добросердечный']) : new Set(PEOPLE)
      for (const id of v) if (!names.has(id)) this.err(`${where}.${key}`, `неизвестный ID «${id}»`)
    }
    if (r.chose !== undefined) {
      if (!isObj(r.chose) || !Object.keys(r.chose).length) this.err(`${where}.chose`, 'нужна карта сюжет → непустой массив ID ответов')
      else for (const [id, choices] of Object.entries(r.chose)) {
        if (!this.known.storyletIds.has(id)) this.err(`${where}.chose`, `неизвестный сюжет «${id}»`)
        if (!Array.isArray(choices) || !choices.length || !choices.every(isStr)) this.err(`${where}.chose.${id}`, 'нужен непустой массив стабильных ID')
        else for (const choice of choices) if (!this.known.choices?.get(id)?.has(choice)) this.err(`${where}.chose.${id}`, `неизвестный стабильный ID ответа «${choice}»`)
      }
    }
    for (const key of ['bond', 'skill', 'ship', 'decisionYears']) {
      if (r[key] === undefined) continue
      if (!isObj(r[key])) { this.err(`${where}.${key}`, 'нужна карта ID → диапазон'); continue }
      const names = key === 'bond' ? new Set(PEOPLE) : key === 'skill' ? new Set(SKILLS) : key === 'ship' ? new Set(SHIP_STATS) : this.known.storyletIds
      for (const [id, value] of Object.entries(r[key])) {
        if (!names.has(id)) this.err(`${where}.${key}.${id}`, 'неизвестный ID')
        this.numberRange(value, `${where}.${key}.${id}`, 0, key === 'decisionYears' ? 120 : 100)
      }
    }
    if (r.birthWealth !== undefined) this.numberRange(r.birthWealth, `${where}.birthWealth`, 1, 5)
    const range = (key: string, min: number, max: number, step = 1) => {
      const value = r[key], w = `${where}.${key}`
      if (value === undefined) return
      if (!isObj(value)) { this.err(w, 'нужен объект {min?, max?}'); return }
      this.keys(value, ['min', 'max'], w)
      if (value.min === undefined && value.max === undefined) this.err(w, 'нужна хотя бы одна граница min или max')
      for (const bound of ['min', 'max']) {
        const n = value[bound]
        if (n === undefined) continue
        const aligned = isNum(n) && (step === 1 ? Number.isSafeInteger(n) : Math.round(n * 10) / 10 === n)
        if (!aligned || (n as number) < min || (n as number) > max) this.err(`${w}.${bound}`, `число от ${min} до ${max} с шагом ${step}`)
      }
      if (isNum(value.min) && isNum(value.max) && value.min > value.max) this.err(w, 'min больше max')
    }
    range('money', 0, Number.MAX_SAFE_INTEGER)
    range('grade', 1, 4)
    range('housing', 0, 2)
    range('reserveYears', ...LIMITS.reserveYears, .1)
    const knownOwnable = (id: string) => !!getOffer(id) || id.startsWith('visit-sector-') && SECTORS.includes(id.slice('visit-sector-'.length))
    for (const key of ['work', 'regime', 'owns', 'ownsNot']) {
      const value = r[key], w = `${where}.${key}`
      if (value === undefined) continue
      if (!Array.isArray(value) || !value.every(isStr)) { this.err(w, 'должен быть массивом строк'); continue }
      for (const id of value) {
        if (key === 'work') {
          if (!['child', 'trainee', 'working', 'between', 'sick', 'retired'].includes(id)) this.err(w, `неизвестный рабочий статус «${id}»`)
        } else if (key === 'regime') {
          if (!(TIME_REGIMES as readonly string[]).includes(id)) this.err(w, `неизвестный рабочий режим «${id}» (допустимы: ${TIME_REGIMES.join(', ')})`)
        } else if (!knownOwnable(id)) {
          this.err(w, `неизвестная позиция или посещённый сектор «${id}»`)
        }
      }
    }
    if (r.ownedYears !== undefined) {
      if (!isObj(r.ownedYears)) this.err(`${where}.ownedYears`, 'должен быть объектом { "позиция": { min?, max? } }')
      else for (const [id, value] of Object.entries(r.ownedYears)) {
        const w = `${where}.ownedYears.${id}`
        if (!knownOwnable(id)) this.err(w, `неизвестная позиция или посещённый сектор «${id}»`)
        if (!isObj(value)) { this.err(w, 'нужен объект {min?, max?}'); continue }
        this.keys(value, ['min', 'max'], w)
        if (value.min === undefined && value.max === undefined) this.err(w, 'нужна хотя бы одна граница min или max')
        for (const bound of ['min', 'max']) {
          const n = value[bound]
          if (n !== undefined && (!isNum(n) || !Number.isInteger(n) || n < 0 || n > 120)) this.err(`${w}.${bound}`, 'целое число лет от 0 до 120')
        }
        if (isNum(value.min) && isNum(value.max) && value.min > value.max) this.err(w, 'min больше max')
      }
    }
    if (r.servicesOpen !== undefined && typeof r.servicesOpen !== 'boolean') this.err(`${where}.servicesOpen`, 'true или false')
    const knownFlag = (k: string, w: string) => {
      if (!this.known.flags.has(k) && !flagsSetHere.has(k)) this.err(w, `флаг «${k}» нигде не ставится — опечатка или нужен сюжет, который его выставит`)
    }
    const lists: Array<'flag' | 'flagNot' | 'alive' | 'present' | 'job' | 'sector' | 'sectorNot'> = ['flag', 'flagNot', 'alive', 'present', 'job', 'sector', 'sectorNot']
    for (const key of lists) {
      const v = r[key]
      if (v === undefined) continue
      if (!Array.isArray(v) || !v.every(isStr)) { this.err(`${where}.${key}`, 'должен быть массивом строк'); continue }
      if (key === 'flag' || key === 'flagNot') v.forEach(k => knownFlag(k, `${where}.${key}`))
      if (key === 'alive' || key === 'present') v.filter(id => !PEOPLE.includes(id)).forEach(id => this.err(`${where}.${key}`, `неизвестный человек «${id}»`))
      if (key === 'sector' || key === 'sectorNot') v.filter(s => !SECTORS.includes(s)).forEach(s => this.err(`${where}.${key}`, `неизвестный сектор «${s}» (есть: ${SECTORS.join(', ')})`))
      if (key === 'job') v.filter(j => !JOBS.includes(j)).forEach(j => this.err(`${where}.job`, `неизвестная профессия «${j}»`))
    }
    const maps: Array<'flagIs' | 'flagNotIs' | 'since' | 'until'> = ['flagIs', 'flagNotIs', 'since', 'until']
    for (const key of maps) {
      const v = r[key]
      if (v === undefined) continue
      if (!isObj(v)) { this.err(`${where}.${key}`, 'должен быть объектом'); continue }
      for (const [k, val] of Object.entries(v)) {
        knownFlag(k, `${where}.${key}`)
        if ((key === 'since' || key === 'until') && !isNum(val)) this.err(`${where}.${key}.${k}`, 'нужно число лет')
      }
    }
    if (r.personAge !== undefined) {
      if (!isObj(r.personAge)) this.err(`${where}.personAge`, 'должен быть объектом')
      else {
        for (const [id, range] of Object.entries(r.personAge)) {
          if (!PEOPLE.includes(id)) this.err(`${where}.personAge.${id}`, `неизвестный человек (есть: ${PEOPLE.join(', ')})`)
          if (!isObj(range) || (!isNum(range.min) && !isNum(range.max))) this.err(`${where}.personAge.${id}`, 'нужен объект {min?, max?} с годами')
        }
      }
    }
    if (r.stat !== undefined) {
      if (!isObj(r.stat)) this.err(`${where}.stat`, 'должен быть объектом')
      else {
        for (const [k, range] of Object.entries(r.stat)) {
          if (!STATS.includes(k)) this.err(`${where}.stat.${k}`, 'неизвестный показатель')
          if (!isObj(range) || (!isNum(range.min) && !isNum(range.max))) this.err(`${where}.stat.${k}`, 'нужен объект {min?, max?}')
        }
      }
    }
  }

  /** Настоящая покупка из сюжета: известная позиция, честная скидка, без второго списания и без броска навыка. */
  purchase(ch: Obj, w: string) {
    const p = ch.purchase
    if (!isObj(p)) { this.err(`${w}.purchase`, 'нужен объект { "offer": "...", "price"?: число }'); return }
    this.keys(p, ['offer', 'price'], `${w}.purchase`)
    const offer = isStr(p.offer) && STORY_PURCHASE_OFFERS.includes(p.offer) ? getOffer(p.offer) : undefined
    if (!offer) this.err(`${w}.purchase.offer`, `позиция из: ${STORY_PURCHASE_OFFERS.join(', ')}`)
    if (p.price !== undefined && (!isNum(p.price) || !Number.isSafeInteger(p.price) || p.price < 1 || offer && p.price > offer.oneTimeCost)) {
      this.err(`${w}.purchase.price`, `сюжетная цена — целое от 1 до каталожной${offer ? ` (${offer.oneTimeCost})` : ''}: скидка не может поднять цену`)
    }
    if (isObj(ch.effects) && ch.effects.money !== undefined && ch.effects.money !== 0) this.err(`${w}.effects.money`, 'выбор с покупкой не списывает деньги отдельно: цену задаёт purchase')
    if (ch.check !== undefined) this.err(`${w}.check`, 'выбор с покупкой не может зависеть от проверки навыка')
  }

  /** Подстановки-люди допустимы, только если человек гарантирован заголовком. */
  personGuard(text: string, guaranteed: string[], where: string) {
    for (const m of text.matchAll(/\{\{(\w+)(?::[^{}]*)?\}\}/g)) {
      if (PERSON_PLACEHOLDERS.includes(m[1]) && !guaranteed.includes(m[1])) {
        this.err(where, `{{${m[1]}}} используется, но человек не гарантирован: упомяните {{${m[1]}}} в body (сюжет) или добавьте "${m[1]}" в needs (момент)`)
      }
    }
  }
}

function flagsSet(items: unknown): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown, depth = 0) => {
    if (depth > 64) return // malformed deeply nested input is rejected by requires(), never followed indefinitely
    if (Array.isArray(v)) v.forEach(child => walk(child, depth + 1))
    else if (isObj(v)) {
      if (isObj(v.flags)) Object.keys(v.flags).forEach(k => out.add(k))
      Object.values(v).forEach(child => walk(child, depth + 1))
    }
  }
  walk(items)
  return out
}

/** Only facts guaranteed by every branch of OR can guard a reference. */
function guardedPeople(r: unknown, depth = 0): string[] {
  if (depth > MAX_REQUIRES_DEPTH || !isObj(r)) return []
  const own = ['present', 'dead', 'exists'].flatMap(k => Array.isArray(r[k]) ? r[k].filter(isStr) : [])
  const branches = Array.isArray(r.any) ? r.any.map(child => guardedPeople(child, depth + 1)) : []
  return [...new Set([...own, ...(branches.length ? branches[0]!.filter(id => branches.every(b => b.includes(id))) : [])])]
}

function createdPeople(effects: unknown): string[] {
  if (!isObj(effects)) return []
  if (effects.addPerson === 'child') return ['child']
  if (isObj(effects.addPerson) && isStr(effects.addPerson.slot) && STORY_PERSON_SLOTS.includes(effects.addPerson.slot)) return [effects.addPerson.slot]
  return []
}

function checkStorylet(c: Ctx, s: unknown, where: string, flags: Set<string>) {
  if (!isObj(s)) { c.err(where, 'сюжет должен быть объектом'); return }
  c.keys(s, ['id', 'category', 'title', 'body', 'min', 'max', 'weight', 'priority', 'arc', 'fork', 'weird', 'requires', 'choices', 'bodyVariants', 'tone', 'tags', 'group'], where)
  c.text(s.title, `${where}.title`, LIMITS.title)
  c.text(s.body, `${where}.body`, LIMITS.body, LIMITS.bodyWarn)
  if (!isStr(s.category) || !c.known.categories.has(s.category)) c.err(`${where}.category`, `«${String(s.category)}» — категория из списка: ${[...c.known.categories].join(', ')}`)
  c.int(s.min, `${where}.min`, LIMITS.age)
  c.int(s.max, `${where}.max`, LIMITS.age)
  if (isNum(s.min) && isNum(s.max) && s.min > s.max) c.err(where, 'min больше max')
  const legacyWeight = (compatibility.legacyWeights as Record<string, number>)[String(s.id)]
  c.int(s.weight, `${where}.weight`, legacyWeight === s.weight ? [legacyWeight, legacyWeight] : LIMITS.weight)
  if (s.tone !== undefined && !['calm', 'warm', 'tense', 'crisis'].includes(s.tone as string)) c.err(`${where}.tone`, 'неизвестный тон')
  const identifier = (v: unknown) => isStr(v) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)
  if (s.group !== undefined && !identifier(s.group)) c.err(`${where}.group`, 'нужен kebab-case ID')
  if (s.tags !== undefined && (!Array.isArray(s.tags) || !s.tags.every(identifier) || new Set(s.tags).size !== s.tags.length)) c.err(`${where}.tags`, 'нужен массив уникальных kebab-case ID')
  if (s.weird !== undefined && s.weird !== 1 && s.weird !== 2) c.err(`${where}.weird`, 'только 1 (тайна) или 2 (тревога), либо без поля')
  if (s.priority !== undefined) {
    if (s.priority !== 'followup' && s.priority !== 'critical') c.err(`${where}.priority`, 'followup, critical или без поля')
    else if (!isObj(s.requires) || !['flag', 'flagIs', 'since', 'until', 'chose', 'seen', 'decisionYears'].some(k => (s.requires as Record<string, unknown>)[k] !== undefined)) {
      c.err(`${where}.priority`, `${s.priority} — это продолжение: нужен requires с flag, flagIs, since или until, иначе сюжет будет идти раньше всех остальных всегда`)
    }
  }
  if (s.arc !== undefined && (!isStr(s.arc) || !c.known.arcs.has(s.arc))) c.err(`${where}.arc`, `линия из списка: ${[...c.known.arcs].join(', ')} (зарегистрируйте новую линию в content/lines.json)`)
  if (s.fork !== undefined && (typeof s.fork !== 'boolean' || !s.arc)) c.err(`${where}.fork`, 'fork: true только вместе с arc')
  if (!Array.isArray(s.choices) || s.choices.length < LIMITS.choices[0] || s.choices.length > LIMITS.choices[1]) {
    c.err(`${where}.choices`, `нужно ${LIMITS.choices[0]}–${LIMITS.choices[1]} выбора`)
    return
  }
  const body = isStr(s.body) ? s.body : ''
  const implicit = mentionedPeople(body).filter(id => !Array.isArray(s.bodyVariants) || s.bodyVariants.every(v =>
    isObj(v) && (isStr(v.text) && mentionedPeople(v.text).includes(id) || guardedPeople(v.requires).includes(id))))
  const guaranteed = [...implicit, ...guardedPeople(s.requires)]
  c.variants(s.bodyVariants, `${where}.bodyVariants`, LIMITS.body, guardedPeople(s.requires), flags, LIMITS.bodyWarn)
  const choiceIds = new Set<string>()
  s.choices.forEach((ch: unknown, i: number) => {
    const w = `${where}.choices[${i}]`
    if (!isObj(ch)) { c.err(w, 'выбор должен быть объектом'); return }
    c.keys(ch, ['id', 'text', 'hint', 'result', 'effects', 'check', 'purchase', 'requires', 'resultVariants', 'epilogue'], w)
    if (ch.id === undefined && !compatibility.legacyChoiceIds.includes(String(s.id))) c.err(`${w}.id`, 'новому JSON нужен стабильный ID ответа')
    if (ch.id !== undefined) {
      if (!isStr(ch.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ch.id)) c.err(`${w}.id`, 'нужен kebab-case ID')
      else if (choiceIds.has(ch.id)) c.err(`${w}.id`, 'повторяющийся ID ответа')
      else choiceIds.add(ch.id)
    }
    c.requires(ch.requires, `${w}.requires`, flags)
    const choiceGuard = [...guaranteed, ...guardedPeople(ch.requires)]
    c.variants(ch.resultVariants, `${w}.resultVariants`, LIMITS.result, choiceGuard, flags, LIMITS.resultWarn)
    if (ch.epilogue !== undefined && c.text(ch.epilogue, `${w}.epilogue`, LIMITS.memory)) c.personGuard(ch.epilogue, choiceGuard, `${w}.epilogue`)
    if (ch.purchase !== undefined) c.purchase(ch, w)
    if (c.text(ch.text, `${w}.text`, LIMITS.label)) c.personGuard(ch.text, choiceGuard, `${w}.text`)
    if (c.text(ch.hint, `${w}.hint`, LIMITS.hint)) c.personGuard(ch.hint, choiceGuard, `${w}.hint`)
    if (c.text(ch.result, `${w}.result`, LIMITS.result, LIMITS.resultWarn)) c.personGuard(ch.result, [...choiceGuard, ...createdPeople(ch.effects)], `${w}.result`)
    c.effects(ch.effects, `${w}.effects`)
    if (isObj(ch.effects) && isStr(ch.effects.memory)) c.personGuard(ch.effects.memory, [...choiceGuard, ...createdPeople(ch.effects)], `${w}.effects.memory`)
    if (ch.check === undefined) return
    const k = ch.check
    if (!isObj(k)) { c.err(`${w}.check`, 'check должен быть объектом'); return }
    c.keys(k, ['skill', 'difficulty', 'successText', 'failureText', 'success', 'failure', 'successVariants', 'failureVariants'], `${w}.check`)
    if (!SKILLS.includes(k.skill as string)) c.err(`${w}.check.skill`, `навык из: ${SKILLS.join(', ')}`)
    c.int(k.difficulty, `${w}.check.difficulty`, [5, 35])
    for (const f of ['successText', 'failureText']) {
      if (c.text(k[f], `${w}.check.${f}`, LIMITS.result, LIMITS.resultWarn)) c.personGuard(k[f] as string, choiceGuard, `${w}.check.${f}`)
    }
    for (const field of ['successVariants', 'failureVariants']) c.variants(k[field], `${w}.check.${field}`, LIMITS.result, choiceGuard, flags)
    c.effects(k.success, `${w}.check.success`, false)
    c.effects(k.failure, `${w}.check.failure`, false)
  })
  if (!s.choices.some(ch => isObj(ch) && ch.requires === undefined && ch.purchase === undefined
    && isObj(ch.effects) && (ch.effects.money === undefined || ch.effects.money === 0)
    && (ch.check === undefined || isObj(ch.check) && ['success', 'failure'].every(key => {
      const effect = (ch.check as Obj)[key]
      return isObj(effect) && (effect.money === undefined || effect.money === 0)
    })))) {
    c.err(`${where}.choices`, 'нужен безусловный бесплатный вариант ответа')
  }
  if (s.choices.some(ch => isObj(ch) && (ch.purchase !== undefined || isObj(ch.effects) && isNum(ch.effects.money) && ch.effects.money < 0))) {
    const free = s.choices.some(ch => isObj(ch) && isObj(ch.effects) && ch.purchase === undefined
      && (ch.effects.money === undefined || validStoryMoney(ch.effects.money) && ch.effects.money >= 0)
      && (ch.check === undefined || isObj(ch.check) && ['success', 'failure'].every(key => {
        const effect = (ch.check as Obj)[key]
        return isObj(effect) && (effect.money === undefined || validStoryMoney(effect.money) && effect.money >= 0)
      })))
    if (!free) c.err(`${where}.choices`, 'денежному сюжету нужен минимум один вариант без обязательного денежного расхода')
  }
}

function checkMoment(c: Ctx, m: unknown, where: string, flags: Set<string>) {
  if (!isObj(m)) { c.err(where, 'момент должен быть объектом'); return }
  c.keys(m, ['id', 'spot', 'title', 'text', 'min', 'max', 'weight', 'cooldown', 'weird', 'needs', 'requires', 'accept', 'skip', 'textVariants'], where)
  if (isStr(m.id) && !m.id.startsWith('m-')) c.err(`${where}.id`, 'id момента начинается с «m-»')
  c.text(m.title, `${where}.title`, LIMITS.title)
  if (!SPOTS.includes(m.spot as string)) c.err(`${where}.spot`, `объект сцены из: ${SPOTS.join(', ')}`)
  c.int(m.min, `${where}.min`, LIMITS.age)
  c.int(m.max, `${where}.max`, LIMITS.age)
  if (isNum(m.min) && isNum(m.max) && m.min > m.max) c.err(where, 'min больше max')
  c.int(m.weight, `${where}.weight`, [1, 5])
  if (m.cooldown !== null) c.int(m.cooldown, `${where}.cooldown`, LIMITS.cooldown)
  if (m.weird !== undefined && m.weird !== 1 && m.weird !== 2) c.err(`${where}.weird`, 'только 1 или 2, либо без поля')
  let needs: string[] = []
  if (m.needs !== undefined) {
    if (!Array.isArray(m.needs) || !m.needs.every(id => PEOPLE.includes(id))) c.err(`${where}.needs`, `массив id из: ${PEOPLE.join(', ')}`)
    else needs = m.needs
  }
  // сцены с ребёнком обязаны привязывать себя к возрасту ребёнка: «детская» сцена не должна дожить до его взрослости
  if (needs.includes('child')) {
    const age = isObj(m.requires) && isObj(m.requires.personAge) ? m.requires.personAge.child : undefined
    if (!isObj(age) || !isNum(age.max)) c.err(`${where}.requires.personAge.child`, 'момент с ребёнком (needs: child) должен ограничить возраст ребёнка через personAge.child.max')
  }
  needs = [...needs, ...guardedPeople(m.requires)]
  c.variants(m.textVariants, `${where}.textVariants`, LIMITS.momentText, guardedPeople(m.requires), flags)
  if (c.text(m.text, `${where}.text`, LIMITS.momentText, LIMITS.momentTextWarn)) c.personGuard(m.text, needs, `${where}.text`)
  const { accept, skip } = m
  if (!isObj(accept)) c.err(`${where}.accept`, 'нужен объект')
  else {
    c.keys(accept, ['label', 'result', 'effects', 'resultVariants'], `${where}.accept`)
    c.text(accept.label, `${where}.accept.label`, LIMITS.label)
    if (c.text(accept.result, `${where}.accept.result`, LIMITS.result, LIMITS.resultWarn)) c.personGuard(accept.result, [...needs, ...createdPeople(accept.effects)], `${where}.accept.result`)
    c.variants(accept.resultVariants, `${where}.accept.resultVariants`, LIMITS.result, needs, flags)
    c.effects(accept.effects, `${where}.accept.effects`, false)
  }
  if (!isObj(skip)) c.err(`${where}.skip`, 'нужен объект')
  else {
    c.keys(skip, ['label', 'effects'], `${where}.skip`)
    c.text(skip.label, `${where}.skip.label`, LIMITS.label)
    if (skip.effects !== undefined) c.effects(skip.effects, `${where}.skip.effects`, false)
  }
}

export interface ContentFile { path: string; kind: 'storylets' | 'moments'; data: unknown }

export function validateRegistrations(lines: unknown, categories: unknown, files: ContentFile[], known: Known): Issue[] {
  const c = new Ctx(known)
  const stories = files.filter(f => f.kind === 'storylets' && Array.isArray(f.data)).flatMap(f => f.data as unknown[]).filter(isObj)
  for (const [name, entries] of [['lines', lines], ['categories', categories]] as const) {
    if (!Array.isArray(entries)) { c.err(`content/${name}.json`, 'нужен массив регистраций'); continue }
    const ids = new Set<string>()
    for (const entry of entries) {
      const where = `content/${name}.json`
      if (!isObj(entry)) { c.err(where, 'нужен объект регистрации'); continue }
      c.keys(entry, name === 'lines' ? ['id', 'title', 'start'] : ['id', 'title'], where)
      if (!isStr(entry.id) || !entry.id.trim() || name === 'lines' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id)) c.err(where, 'неверный ID регистрации')
      else if (ids.has(entry.id)) c.err(where, `повтор регистрации «${entry.id}»`)
      else ids.add(entry.id)
      c.text(entry.title, `${where}.title`, LIMITS.title)
      if (name === 'lines') {
        const start = stories.find(s => s.id === entry.start)
        if (!isStr(entry.start) || !start || start.arc !== entry.id || start.fork !== true) c.err(where, `начало «${String(entry.start)}» должно существовать с тем же arc и fork: true`)
        if (stories.filter(s => s.arc === entry.id && s.fork === true).length !== 1) c.err(where, `линии «${String(entry.id)}» нужно ровно одно начало`)
      }
    }
  }
  return c.issues
}

export function validateContent(files: ContentFile[], known: Known): Issue[] {
  const catalogue = { ...known, storyletIds: new Set(known.storyletIds), choices: new Map(known.choices) }
  for (const f of files) if (f.kind === 'storylets' && Array.isArray(f.data)) for (const item of f.data) {
    if (isObj(item) && isStr(item.id)) {
      catalogue.storyletIds.add(item.id)
      catalogue.choices.set(item.id, new Set(Array.isArray(item.choices) ? item.choices.flatMap(ch => isObj(ch) && isStr(ch.id) ? [ch.id] : []) : []))
    }
  }
  const c = new Ctx(catalogue)
  const seen = new Map<string, string>()
  const setHere = flagsSet(files.map(f => f.data))
  for (const f of files) {
    if (!Array.isArray(f.data)) { c.err(f.path, 'файл должен содержать JSON-массив'); continue }
    f.data.forEach((item: unknown, i: number) => {
      const id = isObj(item) && isStr(item.id) ? item.id : `#${i}`
      const where = `${f.path} → ${id}`
      if (!isObj(item) || !isStr(item.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) c.err(where, 'id: строчные латинские слова через дефис')
      else {
        const clash = seen.get(item.id) ?? (known.storyletIds.has(item.id) || known.momentIds.has(item.id) ? 'кодом проекта' : undefined)
        if (clash) c.err(where, `id уже занят (${clash})`)
        seen.set(item.id, f.path)
      }
      if (isObj(item)) c.requires(item.requires, `${where}.requires`, setHere)
      if (f.kind === 'storylets') checkStorylet(c, item, where, setHere)
      else checkMoment(c, item, where, setHere)
    })
  }
  return c.issues
}
