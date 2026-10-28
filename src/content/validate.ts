import type { Effects, MomentDef, Storylet } from '../domain/types'
import { getOffer } from '../domain/offers'
import { STORY_MONEY_LIMIT, validStoryMoney } from '../domain/storyMoney'

export interface Issue { level: 'error' | 'warn'; where: string; message: string }

export const STATS = ['health', 'morale', 'stress', 'knowledge', 'bonds', 'reputation']
export const SHIP_STATS = ['air', 'food', 'cohesion', 'hull']
export const SKILLS = ['engineering', 'medicine', 'ecology', 'social']
export const JOBS = ['Ученик', 'Техник', 'Медик', 'Агроном', 'Координатор', 'Без специальности']
export const SPOTS = ['window', 'door', 'terminal', 'parent', 'table', 'plant']
export const PEOPLE = ['parent', 'parent2', 'sibling', 'friend', 'neighbor', 'mentor', 'child']
export const SECTORS = ['atrium', 'bio', 'engineering', 'clinic', 'lower']
/** Люди, которых эффект `addPerson` может добавить в жизнь героя. */
export const NEW_PEOPLE = ['child']
/** Подстановки {{...}}, которые понимает resolveText. */
export const PLACEHOLDERS = ['name', 'job', 'parent', 'friend', 'neighbor', 'mentor', 'sibling', 'child']
/** Подстановки-люди: должны быть гарантированы заголовком (body у сюжета, needs у момента). */
const PERSON_PLACEHOLDERS = ['parent', 'friend', 'neighbor', 'mentor', 'sibling', 'child']
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
}

type EffectHolder = { effects?: Effects; check?: { success: Effects; failure: Effects } }

export function collectKnown(storylets: Storylet[], moments: MomentDef[]): Known {
  const flags = new Set<string>(ENGINE_FLAGS)
  const add = (e?: Effects) => Object.keys(e?.flags ?? {}).forEach(k => flags.add(k))
  const addHolder = (c: EffectHolder) => { add(c.effects); add(c.check?.success); add(c.check?.failure) }
  for (const s of storylets) s.choices.forEach(addHolder)
  for (const m of moments) { add(m.accept.effects); add(m.skip.effects) }
  return {
    storyletIds: new Set(storylets.map(s => s.id)),
    momentIds: new Set(moments.map(m => m.id)),
    flags,
    arcs: new Set(storylets.map(s => s.arc).filter((a): a is string => !!a)),
    categories: new Set(storylets.map(s => s.category))
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

  int(v: unknown, where: string, range: Range) {
    if (!isNum(v) || !Number.isInteger(v)) this.err(where, 'должно быть целое число')
    else if (v < range[0] || v > range[1]) this.err(where, `${v} вне диапазона ${range[0]}–${range[1]}`)
  }

  effects(e: unknown, where: string, allowExpense = true) {
    if (!isObj(e)) { this.err(where, 'effects должен быть объектом (может быть пустым {})'); return }
    this.keys(e, ['stats', 'ship', 'skills', 'bonds', 'flags', 'job', 'memory', 'addPerson', 'moveTo', 'money'], where)
    if (e.money !== undefined) {
      if (!validStoryMoney(e.money)) this.err(`${where}.money`, `нужно безопасное целое число в пределах ±${LIMITS.money}`)
      else if (!allowExpense && e.money < 0) this.err(`${where}.money`, 'отрицательные деньги здесь запрещены')
    }
    const nums = (key: string, names: string[], limit: number, warnAt?: number) => {
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
    if (e.addPerson !== undefined && !NEW_PEOPLE.includes(e.addPerson as string)) this.err(`${where}.addPerson`, `можно добавить только: ${NEW_PEOPLE.join(', ')}`)
    if (e.moveTo !== undefined && !SECTORS.includes(e.moveTo as string)) this.err(`${where}.moveTo`, `сектор из: ${SECTORS.join(', ')}`)
    if (e.memory !== undefined) this.text(e.memory, `${where}.memory`, LIMITS.memory)
  }

  requires(r: unknown, where: string, flagsSetHere: Set<string>) {
    if (r === undefined) return
    if (!isObj(r)) { this.err(where, 'requires должен быть объектом'); return }
    this.keys(r, ['flag', 'flagNot', 'flagIs', 'flagNotIs', 'since', 'until', 'personAge', 'job', 'alive', 'present', 'stat', 'sector', 'sectorNot', 'money', 'work', 'grade', 'housing', 'owns', 'ownsNot', 'reserveYears', 'ownedYears', 'servicesOpen'], where)
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
    for (const key of ['work', 'owns', 'ownsNot']) {
      const value = r[key], w = `${where}.${key}`
      if (value === undefined) continue
      if (!Array.isArray(value) || !value.every(isStr)) { this.err(w, 'должен быть массивом строк'); continue }
      for (const id of value) {
        if (key === 'work') {
          if (!['child', 'trainee', 'working', 'between', 'sick', 'retired'].includes(id)) this.err(w, `неизвестный рабочий статус «${id}»`)
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
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (isObj(v)) {
      if (isObj(v.flags)) Object.keys(v.flags).forEach(k => out.add(k))
      Object.values(v).forEach(walk)
    }
  }
  walk(items)
  return out
}

function checkStorylet(c: Ctx, s: unknown, where: string) {
  if (!isObj(s)) { c.err(where, 'сюжет должен быть объектом'); return }
  c.keys(s, ['id', 'category', 'title', 'body', 'min', 'max', 'weight', 'priority', 'arc', 'fork', 'weird', 'requires', 'choices'], where)
  c.text(s.title, `${where}.title`, LIMITS.title)
  c.text(s.body, `${where}.body`, LIMITS.body, LIMITS.bodyWarn)
  if (!isStr(s.category) || !c.known.categories.has(s.category)) c.err(`${where}.category`, `«${String(s.category)}» — категория из списка: ${[...c.known.categories].join(', ')}`)
  c.int(s.min, `${where}.min`, LIMITS.age)
  c.int(s.max, `${where}.max`, LIMITS.age)
  if (isNum(s.min) && isNum(s.max) && s.min > s.max) c.err(where, 'min больше max')
  c.int(s.weight, `${where}.weight`, LIMITS.weight)
  if (s.weird !== undefined && s.weird !== 1 && s.weird !== 2) c.err(`${where}.weird`, 'только 1 (тайна) или 2 (тревога), либо без поля')
  if (s.priority !== undefined) {
    if (s.priority !== 'followup' && s.priority !== 'critical') c.err(`${where}.priority`, 'followup, critical или без поля')
    else if (!isObj(s.requires) || !['flag', 'flagIs', 'since', 'until'].some(k => (s.requires as Record<string, unknown>)[k] !== undefined)) {
      c.err(`${where}.priority`, `${s.priority} — это продолжение: нужен requires с flag, flagIs, since или until, иначе сюжет будет идти раньше всех остальных всегда`)
    }
  }
  if (s.arc !== undefined && (!isStr(s.arc) || !c.known.arcs.has(s.arc))) c.err(`${where}.arc`, `линия из списка: ${[...c.known.arcs].join(', ')} (новые линии согласуйте с Claude)`)
  if (s.fork !== undefined && (typeof s.fork !== 'boolean' || !s.arc)) c.err(`${where}.fork`, 'fork: true только вместе с arc')
  if (!Array.isArray(s.choices) || s.choices.length < LIMITS.choices[0] || s.choices.length > LIMITS.choices[1]) {
    c.err(`${where}.choices`, `нужно ${LIMITS.choices[0]}–${LIMITS.choices[1]} выбора`)
    return
  }
  const body = isStr(s.body) ? s.body : ''
  const guaranteed = PERSON_PLACEHOLDERS.filter(p => body.includes(`{{${p}}}`) || body.includes(`{{${p}:`))
  s.choices.forEach((ch: unknown, i: number) => {
    const w = `${where}.choices[${i}]`
    if (!isObj(ch)) { c.err(w, 'выбор должен быть объектом'); return }
    c.keys(ch, ['text', 'hint', 'result', 'effects', 'check', 'purchase'], w)
    if (ch.purchase !== undefined) c.purchase(ch, w)
    if (c.text(ch.text, `${w}.text`, LIMITS.label)) c.personGuard(ch.text, guaranteed, `${w}.text`)
    c.text(ch.hint, `${w}.hint`, LIMITS.hint)
    if (c.text(ch.result, `${w}.result`, LIMITS.result, LIMITS.resultWarn)) c.personGuard(ch.result, guaranteed, `${w}.result`)
    c.effects(ch.effects, `${w}.effects`)
    if (ch.check === undefined) return
    const k = ch.check
    if (!isObj(k)) { c.err(`${w}.check`, 'check должен быть объектом'); return }
    c.keys(k, ['skill', 'difficulty', 'successText', 'failureText', 'success', 'failure'], `${w}.check`)
    if (!SKILLS.includes(k.skill as string)) c.err(`${w}.check.skill`, `навык из: ${SKILLS.join(', ')}`)
    c.int(k.difficulty, `${w}.check.difficulty`, [5, 35])
    for (const f of ['successText', 'failureText']) {
      if (c.text(k[f], `${w}.check.${f}`, LIMITS.result, LIMITS.resultWarn)) c.personGuard(k[f] as string, guaranteed, `${w}.check.${f}`)
    }
    c.effects(k.success, `${w}.check.success`, false)
    c.effects(k.failure, `${w}.check.failure`, false)
  })
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

function checkMoment(c: Ctx, m: unknown, where: string) {
  if (!isObj(m)) { c.err(where, 'момент должен быть объектом'); return }
  c.keys(m, ['id', 'spot', 'title', 'text', 'min', 'max', 'weight', 'cooldown', 'weird', 'needs', 'requires', 'accept', 'skip'], where)
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
  if (c.text(m.text, `${where}.text`, LIMITS.momentText, LIMITS.momentTextWarn)) c.personGuard(m.text, needs, `${where}.text`)
  const { accept, skip } = m
  if (!isObj(accept)) c.err(`${where}.accept`, 'нужен объект')
  else {
    c.keys(accept, ['label', 'result', 'effects'], `${where}.accept`)
    c.text(accept.label, `${where}.accept.label`, LIMITS.label)
    if (c.text(accept.result, `${where}.accept.result`, LIMITS.result, LIMITS.resultWarn)) c.personGuard(accept.result, needs, `${where}.accept.result`)
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

export function validateContent(files: ContentFile[], known: Known): Issue[] {
  const c = new Ctx(known)
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
      if (f.kind === 'storylets') checkStorylet(c, item, where)
      else checkMoment(c, item, where)
    })
  }
  return c.issues
}
