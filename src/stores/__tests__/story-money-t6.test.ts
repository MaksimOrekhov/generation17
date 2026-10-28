import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import DecisionModal from '../../components/play/DecisionModal.vue'
import { useHotkeys } from '../../composables/useHotkeys'
import { storylets } from '../../domain/storylets'
import { moneyStory, moneyWorker } from '../../domain/__tests__/t6-fixtures'
import { useGameStore } from '../game'

const length = storylets.length
let pinia: ReturnType<typeof createPinia>
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); storylets.push(moneyStory()) })
afterEach(() => { storylets.splice(length); vi.unstubAllGlobals() })
const start = (balance = 300) => { const s = useGameStore(); s.game = moneyWorker(balance); return s }

describe('T6 Pinia and decision rendering', () => {
  it('keeps pending/result/game untouched after a refused choice', () => {
    const s = start(), before = s.game, hints = { ...s.hintsSeen }
    s.choose(0)
    expect(s.game).toBe(before); expect(s.result).toBeNull(); expect(s.game.pending).toBe('t6-money-fixture')
    expect(s.hintsSeen).toEqual(hints)
  })
  it('rechecks the current balance instead of trusting earlier affordability', () => {
    const s = start(500)
    s.game = { ...s.game, economy: { ...s.game.economy, balance: 399 } }
    s.choose(0); expect(s.result).toBeNull(); expect(s.game.pending).toBe('t6-money-fixture')
    s.game = { ...s.game, economy: { ...s.game.economy, balance: 400 } }
    s.choose(0); expect(s.game.economy.balance).toBe(0); expect(s.result!.length).toBeGreaterThan(0)
  })
  it('accepts the free alternative and shows its actual nonempty result', () => {
    const s = start(0); s.choose(1)
    expect(s.game.pending).toBeNull(); expect(s.game.economy.balance).toBe(0); expect(s.result!.length).toBeGreaterThan(0)
    expect(s.game.flags.t6Free).toBe(true)
  })
  it('renders all options, disabled payment, precise reason and signed income', async () => {
    start()
    const app = createSSRApp({ render: () => h(DecisionModal) })
    app.use(pinia)
    const context: { teleports?: Record<string, string> } = {}
    await renderToString(app, context)
    const html = context.teleports?.body?.replace(/ /g, ' ') ?? ''
    expect(html).toContain('Не хватает 100 кр.')
    expect(html).toContain('−400 кр.'); expect(html).toContain('+250 кр.')
    expect(html.match(/class="choice"/g)).toHaveLength(4)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Оплатить помощь/)
    expect(html).toMatch(/<button class="choice"(?![^>]*disabled)[^>]*>[\s\S]*?Отказаться/)
  })
})

describe('T6 actual mounted hotkey handler', () => {
  function mount() {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const renderer = createRenderer<object, object>({ patchProp() {}, insert() {}, remove() {},
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null })
    const app = renderer.createApp({ setup() { useHotkeys(() => true); return () => h('div') } })
    app.mount({})
    return { app, press(key: string) { const e = new Event('keydown'); Object.assign(e, { key, code: `Digit${key}` }); win.dispatchEvent(e) } }
  }
  it.each(['1', '3', '4'])('numeric key %s cannot bypass payment or open an empty result', key => {
    const s = start(), event = storylets.find(e => e.id === 't6-money-fixture')!
    event.choices[2]!.effects.money = -800
    const before = s.game, keys = mount()
    keys.press(key)
    expect(s.game).toBe(before); expect(s.result).toBeNull(); expect(s.game.pending).toBe(event.id)
    keys.app.unmount()
  })
  it('key 2 still selects the free alternative', () => {
    const s = start(0), keys = mount(); keys.press('2')
    expect(s.game.pending).toBeNull(); expect(s.result!.length).toBeGreaterThan(0); expect(s.game.flags.t6Free).toBe(true)
    keys.app.unmount()
  })
  it('key 3 can accept a positive reward using the same store/domain checks', () => {
    const s = start(0), keys = mount(); keys.press('3')
    expect(s.game.economy.balance).toBe(250); expect(s.game.economy.totals.earned).toBe(250)
    expect(s.result!.length).toBeGreaterThan(0); keys.app.unmount()
  })
})
