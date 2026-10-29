import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import MomentPopup from '../../components/scene/MomentPopup.vue'
import SceneView from '../../components/scene/SceneView.vue'
import SpendModal from '../../components/play/SpendModal.vue'
import { createGame, setLoad } from '../../domain/engine'
import { startPersonalTimeYear } from '../../domain/personalTime'
import { spendView } from '../../domain/spendView'
import { withPending, t7Worker } from '../../domain/__tests__/t7-fixtures'
import type { GameState } from '../../domain/types'
import { useGameStore } from '../game'

function adult(age = 45, load: 1 | 0.6 = 1, balance = 5_000): GameState {
  const g = createGame(4242)
  g.age = age; g.economy.settledAge = age; g.economy.balance = balance
  g.protagonist.job = 'Техник'
  g.economy.work = { ...g.economy.work, kind: 'working', job: 'Техник', load, service: age - 18, jobSince: 18, gradeSince: 18, lastWage: 1_100 }
  g.ship.air = 100; g.ship.food = 100
  startPersonalTimeYear(g)
  return g
}
const plain = (s: string) => s.replace(/[  ]/g, ' ')
let pinia: ReturnType<typeof createPinia>
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => vi.unstubAllGlobals())

async function render(component: object, props: Record<string, unknown> = {}) {
  const app = createSSRApp({ render: () => h(component, props) })
  app.use(pinia)
  const context: { teleports?: Record<string, string> } = {}
  const html = await renderToString(app, context)
  return plain(html + (context.teleports?.body ?? ''))
}
function startAt(g: GameState) {
  const store = useGameStore()
  store.begin()
  store.game = g
  return store
}

describe('T9: окно трат показывает остаток, максимум и его основание', () => {
  it('сокращённая ставка: 4/4 и «+1 ед. в год»; полная: 3 ед. в год', () => {
    expect(spendView(adult(45, .6)).time).toMatchObject({ counter: 'Личное время: 4/4', basisText: 'Сокращённая ставка · +1 ед. в год', next: null })
    expect(spendView(adult()).time).toMatchObject({ counter: 'Личное время: 3/3', basisText: 'Полная ставка · 3 ед. в год', next: null })
    expect(spendView({ ...adult(), attention: 0 }).time.emptyText).toBe('В этом году не осталось личного времени.')
  })

  it('сравнение ставок: строка «Личное время за год» из общих правил; после выбора 0,6 — «со следующего года»', () => {
    const g = adult()
    const row = spendView(g).work.load.compare!.find(r => r.label === 'Личное время за год')
    expect(row).toEqual({ label: 'Личное время за год', full: '3 ед.', reduced: '4 ед.' })
    expect(spendView(g).work.load.explanation).toContain('личного времени — больше: 4 ед. в год вместо 3. Его')
    const reduced = setLoad(g, .6)
    const view = spendView(reduced)
    expect(view.time.next?.text).toBe('Со следующего года: 4 ед. — сокращённая ставка.')
    expect(view.work.load.timeNote).toBe('Сокращённая ставка начнёт действовать со следующего игрового года — тогда же личного времени станет 4 ед. в год. В этом году остаётся 3 из 3.')
    const back = spendView(setLoad(adult(50, .6), 1))
    expect(back.work.load.timeNote).toMatch(/^Полная ставка вернётся со следующего игрового года: личного времени будет 3 ед\. в год/)
    expect(back.time.next?.text).toBe('Со следующего года: 3 ед. — полная ставка.')
  })

  it('стоимость покупки и причина недоступности: курс — 2 ед.', () => {
    const g = { ...adult(), attention: 1 }
    const course = spendView(g).offers.find(o => o.id === 'course-pro')!
    expect(course.attentionText).toBe('Личное время: 2 ед.')
    expect(course.reason).toBe('Не хватает личного времени: нужно 2 ед., осталось 1.')
    expect(course.available).toBe(false)
    const store = startAt(g)
    expect(store.buy('course-pro')).toBe(false)
    expect(store.game).toBe(g)
    expect(spendView(adult()).offers.find(o => o.id === 'own-cabin')!.attentionText).toBeNull()
  })

  it('пенсия: объясняет перемену личного времени и не обещает событий', () => {
    const working = spendView(adult(63)).work.retirement!
    expect(working.notes.join(' ')).toContain('личного времени — 4 ед. в год вместо нынешних 3 ед.')
    const decided = adult(63); decided.flags.retirement = true; decided.flags.retirementPath = 'mentor'
    expect(spendView(decided).work.retirement!.notes.join(' ')).toContain('личного времени будет 4 ед. в год')
    const g = adult(66)
    g.flags.retirement = true; g.flags.retirementPath = 'left'
    g.economy.work = { ...g.economy.work, kind: 'retired', path: 'left' }
    startPersonalTimeYear(g)
    expect(spendView(g).work.retirement!.rows).toContainEqual({ label: 'Личное время', value: '4 ед. в год' })
    expect(spendView(g).time.basisText).toBe('Пенсия · +1 ед. в год')
  })

  it('окно трат: счётчик «Личное время» вместо «Внимания», основание и следующий год', async () => {
    startAt(setLoad({ ...adult(), attention: 2 }, .6))
    const html = await render(SpendModal)
    expect(html).toContain('Личное время')
    expect(html).toMatch(/data-test="attention"[^>]*>2\/3</)
    expect(html).toContain('Полная ставка · 3 ед. в год')
    expect(html).toContain('Со следующего года: 4 ед. — сокращённая ставка.')
    expect(html).not.toMatch(/[Вв]нимани/)
  })
})

describe('T9: короткие моменты и счётчик в сцене', () => {
  const props = { title: 'Вечер у стекла', text: 'Все разошлись.', where: 'окно', acceptLabel: 'Постоять', skipLabel: 'Пройти мимо', left: 1, cost: 1 }

  it('кнопка показывает цену и остаток; при нуле выключена и объясняет почему', async () => {
    const open = await render(MomentPopup, { ...props, timeLeft: 3 })
    expect(open).toContain('−1 ед. личного времени · осталось 3')
    expect(open).not.toContain('disabled')
    const empty = await render(MomentPopup, { ...props, timeLeft: 0 })
    expect(empty).toMatch(/<button class="btn btn--primary" disabled/)
    expect(empty).toContain('В этом году не осталось личного времени')
  })

  it('в сцене столько делений, сколько даёт год: 4 у сокращённой ставки, 3 у полной', async () => {
    const count = (html: string) => (html.match(/data-test="time-hud"[\s\S]*?<\/span>/)?.[0].match(/<i/g) ?? []).length
    startAt(adult(45, .6))
    const reduced = await render(SceneView)
    expect(reduced).toContain('личное время')
    expect(reduced).toContain('Сокращённая ставка · +1 ед. в год')
    expect(count(reduced)).toBe(4)
    setActivePinia(pinia = createPinia())
    startAt(adult())
    expect(count(await render(SceneView))).toBe(3)
  })

  it('открытое окно трат не даёт принять или отклонить момент; при нуле принять нельзя', () => {
    const g = { ...adult(), moment: 'm-window-evening' }
    const store = startAt(g)
    store.openShop()
    store.acceptMoment(); store.dismissMoment()
    expect(store.game).toBe(g)
    store.closeShop()
    store.game = { ...g, attention: 0 }
    const empty = store.game
    store.acceptMoment()
    expect(store.game).toBe(empty)
  })
})

describe('T9: сюжетный выбор через хранилище (клавиши 1–4 вызывают тот же choose)', () => {
  it('курс при одной единице не проходит ни нажатием, ни клавишей; бесплатный вариант проходит', () => {
    const store = startAt(withPending(t7Worker(1_000), 'window-offer'))
    store.game = { ...store.game, attention: 1 }
    const before = store.game
    store.choose(0)
    expect(store.game).toBe(before); expect(store.result).toBeNull()
    store.choose(2)
    expect(store.game.pending).toBeNull()
    expect(store.game.attention).toBe(1)
  })
})

describe('T9: загрузка сохранения в хранилище', () => {
  it('старое сохранение без лимита года: остаток сохранён, лимит 3 по прежним правилам', () => {
    const raw = JSON.parse(JSON.stringify(adult(50, .6))) as Record<string, unknown>
    delete raw.timeYear
    raw.attention = 1
    const memory = new Map<string, string>([['generation17-v2', JSON.stringify({ game: raw, started: true, preset: 60 })]])
    vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = useGameStore()
    expect(store.game.attention).toBe(1)
    expect(store.game.timeYear).toEqual({ limit: 3, basis: 'legacy' })
    expect(spendView(store.game).time.next?.text).toBe('Со следующего года: 4 ед. — сокращённая ставка.')
  })
})
