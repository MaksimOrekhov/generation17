import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import DecisionModal from '../../components/play/DecisionModal.vue'
import ForksPanel from '../../components/panels/ForksPanel.vue'
import { useHotkeys } from '../../composables/useHotkeys'
import { compileStorylet } from '../../content/load'
import biography from '../../content/__tests__/fixtures/biography.json'
import type { JsonStorylet } from '../../content/types'
import { storylets } from '../../domain/storylets'
import { moneyWorker } from '../../domain/__tests__/t6-fixtures'
import { useGameStore } from '../game'

const original = [...storylets]
let pinia: ReturnType<typeof createPinia>
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); storylets.push(...(biography as JsonStorylet[]).map(compileStorylet)) })
afterEach(() => { storylets.splice(0, storylets.length, ...original); vi.unstubAllGlobals() })
function start(past: 'help' | 'refuse' | 'unseen') {
  const store = useGameStore(), g = moneyWorker(1000)
  g.pending = 'archive-return'
  g.decisions = past === 'unseen' ? [] : [{ id: 'archive-help', choice: past, age: 20 }]
  store.game = g
  return store
}
function mount() {
  const win = new EventTarget(); vi.stubGlobal('window', win)
  const renderer = createRenderer<object, object>({ patchProp() {}, insert() {}, remove() {},
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null })
  const app = renderer.createApp({ setup() { useHotkeys(() => true); return () => h('div') } }); app.mount({})
  return { app, press(key: string) { const e = new Event('keydown'); Object.assign(e, { key, code: `Digit${key}` }); win.dispatchEvent(e) } }
}
describe('v2 real modal, Pinia and mounted numeric hotkeys', () => {
  it.each(['help', 'refuse', 'unseen'] as const)('%s renders only visible choices numbered from 1', async past => {
    const store = start(past), app = createSSRApp({ render: () => h(DecisionModal) }); app.use(pinia)
    const context: { teleports?: Record<string, string> } = {}; await renderToString(app, context)
    const html = context.teleports?.body ?? ''
    expect(html.match(/class="choice"/g)).toHaveLength(past === 'unseen' ? 1 : 2)
    expect(html).toMatch(/<kbd[^>]*>1<\/kbd>/)
    expect(html.includes('Вспомнить тот вечер')).toBe(past === 'help')
    expect(html.includes('Попросить прощения')).toBe(past === 'refuse')
    expect(store.visibleChoices).toEqual(past === 'help' ? [0, 2] : past === 'refuse' ? [1, 2] : [2])
  })
  it.each([['refuse', '1', 'apologize'], ['help', '2', 'listen'], ['unseen', '1', 'listen']] as const)('past %s key %s selects %s', (past, key, choice) => {
    const store = start(past), keys = mount(); keys.press(key)
    expect(store.game.decisions.at(-1)!.choice).toBe(choice)
    expect(store.game.pending).toBeNull(); expect(store.result?.length).toBeGreaterThan(0)
    keys.press(key); expect(store.game.decisions.filter(d => d.id === 'archive-return')).toHaveLength(1)
    keys.app.unmount()
  })
  it('a direct source index cannot call a hidden answer', () => {
    const store = start('refuse'), before = store.game; store.choose(0)
    expect(store.game).toBe(before); expect(store.result).toBeNull()
  })
  it('renders a new JSON line in the existing ForksPanel with its continuation', async () => {
    const store = start('unseen'), first = storylets.find(s => s.id === 'archive-help')!, next = storylets.find(s => s.id === 'archive-return')!
    first.arc = 'archive'; first.fork = true; next.arc = 'archive'
    store.game = { ...store.game, pending: first.id }; store.chooseVisible(0)
    store.continueAfterResult()
    store.game = { ...store.game, pending: next.id }; store.chooseVisible(0)
    const app = createSSRApp({ render: () => h(ForksPanel) }); app.use(pinia)
    const html = await renderToString(app)
    expect(html).toContain('Развилки'); expect(html).toContain('Коробка у двери'); expect(html).toContain('Старая коробка')
    expect(store.game.forks).toHaveLength(1); expect(store.game.forks[0]!.outcomes).toHaveLength(1)
  })
  it('a visible but unpaid answer stays disabled and hotkeys obey domain checks', async () => {
    const store = start('help'), event = storylets.find(s => s.id === store.game.pending)!
    event.choices[0]!.effects.money = -1001
    const app = createSSRApp({ render: () => h(DecisionModal) }); app.use(pinia)
    const context: { teleports?: Record<string, string> } = {}; await renderToString(app, context)
    expect(context.teleports!.body).toContain('Не хватает 1 кр.')
    expect(store.visibleChoices).toEqual([0, 2])
    const keys = mount(), before = store.game; keys.press('1'); expect(store.game).toBe(before)
    keys.press('2'); expect(store.game.decisions.at(-1)!.choice).toBe('listen'); keys.app.unmount()
  })
})
