import { createSSRApp, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../../domain/engine'
import { useGameStore } from '../../stores/game'
import { LIFE_TARGETS, jumpToLifeTarget } from '../../ui/lifeNav'
import LifeNav from '../panels/LifeNav.vue'
import FamilyPanel from '../panels/FamilyPanel.vue'
import ForksPanel from '../panels/ForksPanel.vue'
import ShipPanel from '../panels/ShipPanel.vue'
import MemoryPanel from '../panels/MemoryPanel.vue'

async function render(component: Component, props: Record<string, unknown> = {}, forks = 0) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useGameStore()
  const game = createGame(43)
  game.forks = Array.from({ length: forks }, (_, i) => ({ arc: `a${i}`, title: 'T', age: 20, chosen: 'x', others: ['y'], outcomes: [] }))
  store.game = game
  const app = createSSRApp(component, props)
  app.use(pinia)
  return renderToString(app)
}

describe('LifeNav', () => {
  afterEach(() => setActivePinia(undefined))

  it('рендерит ровно одну nav с четырьмя ориентирами', async () => {
    const html = await render(LifeNav, { hasForks: true, blocked: false })
    expect(html.match(/<nav /g)).toHaveLength(1)
    expect(html).toContain('aria-label="Ориентиры жизни"')
    for (const id of Object.values(LIFE_TARGETS)) expect(html).toContain(`href="#${id}"`)
    expect(html).not.toContain('inert')
  })

  it('без развилок: нет ссылки на life-forks, есть нейтральный текст', async () => {
    const html = await render(LifeNav, { hasForks: false, blocked: false })
    expect(html).not.toContain('#life-forks')
    expect(html).toContain('Развилок пока нет')
    expect(html.match(/<a /g)).toHaveLength(3)
  })

  it('при блокирующем окне nav inert', async () => {
    expect(await render(LifeNav, { hasForks: true, blocked: true })).toContain('inert')
  })
})

describe('цели переходов на корне Panel', () => {
  afterEach(() => setActivePinia(undefined))

  it.each([
    [FamilyPanel, 'life-family', 0],
    [ForksPanel, 'life-forks', 1],
    [ShipPanel, 'life-ship', 0],
    [MemoryPanel, 'life-memory', 0]
  ] as const)('%# id, tabindex=-1 и aria-label', async (component, id, forks) => {
    const html = await render(component, {}, forks)
    expect(html).toMatch(new RegExp(`<section[^>]*id="${id}"`))
    expect(html).toMatch(/<section[^>]*tabindex="-1"/)
    expect(html).toMatch(/<section[^>]*aria-label="[^"]+"/)
  })

  it('ForksPanel без развилок не рендерит цель', async () => {
    expect(await render(ForksPanel, {}, 0)).not.toContain('life-forks')
  })
})

describe('jumpToLifeTarget', () => {
  const makeTarget = () => ({ scrollIntoView: vi.fn(), focus: vi.fn() })

  it('по явному действию прокручивает и фокусирует существующую цель', () => {
    const el = makeTarget()
    const doc = { getElementById: vi.fn(() => el as unknown as HTMLElement) }
    expect(jumpToLifeTarget('life-ship', { blocked: false, doc })).toBe(true)
    expect(doc.getElementById).toHaveBeenCalledWith('life-ship')
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(el.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('без цели ничего не делает', () => {
    expect(jumpToLifeTarget('life-forks', { blocked: false, doc: { getElementById: () => null } })).toBe(false)
  })

  it('при блокировке не ищет цель, не скроллит и не фокусирует', () => {
    const el = makeTarget()
    const doc = { getElementById: vi.fn(() => el as unknown as HTMLElement) }
    expect(jumpToLifeTarget('life-family', { blocked: true, doc })).toBe(false)
    expect(doc.getElementById).not.toHaveBeenCalled()
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })

  it('не меняет состояние стора', () => {
    setActivePinia(createPinia())
    const store = useGameStore()
    const before = JSON.stringify([store.pendingDeathNotices, store.game.shipYear, store.playing])
    jumpToLifeTarget('life-memory', { blocked: false, doc: { getElementById: () => makeTarget() as unknown as HTMLElement } })
    expect(JSON.stringify([store.pendingDeathNotices, store.game.shipYear, store.playing])).toBe(before)
    setActivePinia(undefined)
  })
})
