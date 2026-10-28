import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import DecisionModal from '../../components/play/DecisionModal.vue'
import { t7Worker, withPending } from '../../domain/__tests__/t7-fixtures'
import { useGameStore } from '../game'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
afterEach(() => vi.unstubAllGlobals())
const start = (balance = 1000) => { const s = useGameStore(); s.game = withPending(t7Worker(balance), 'window-offer'); return s }

async function render() {
  const app = createSSRApp({ render: () => h(DecisionModal) })
  app.use(pinia)
  const context: { teleports?: Record<string, string> } = {}
  await renderToString(app, context)
  return context.teleports?.body?.replace(/[  ]/g, ' ') ?? ''
}

describe('T7 story purchases in Pinia and the decision modal', () => {
  it('the trip cannot be chosen by key or click until two close people are picked', () => {
    const s = start(), before = s.game
    s.choose(1)
    expect(s.game).toBe(before); expect(s.result).toBeNull()
    s.toggleStoryParticipant('friend')
    s.choose(1)
    expect(s.game).toBe(before)
    s.toggleStoryParticipant('sibling')
    s.choose(1)
    expect(s.game.pending).toBeNull()
    expect(s.game.flags).toMatchObject({ familyTripFriend: 35, familyTripSibling: 35 })
    expect(s.game.economy.balance).toBe(680)
    expect(s.result!.map(r => r.title)).toEqual(['Решение: Позвать близких на обзорную палубу', 'Неделя на обзорной палубе'])
  })
  it('selection is capped at three and resets with the next decision', async () => {
    const s = start()
    for (const id of ['friend', 'sibling', 'parent', 'parent2']) s.toggleStoryParticipant(id)
    expect(s.storyParticipants).toEqual(['friend', 'sibling', 'parent'])
    s.toggleStoryParticipant('sibling')
    expect(s.storyParticipants).toEqual(['friend', 'parent'])
    s.game = { ...s.game, pending: null }
    await nextTick()
    expect(s.storyParticipants).toEqual([])
  })
  it('a course choice ignores trip selection and buys at the story price', () => {
    const s = start()
    s.toggleStoryParticipant('friend')
    s.choose(0)
    expect(s.game.economy.balance).toBe(700)
    expect(s.game.economy.work.courses).toBe(1)
  })
  it('renders the discounted price, attention, the picker and the missing-participants reason', async () => {
    start()
    const html = await render()
    expect(html).toContain('−300 кр. · вместо 350 кр. · внимание −1')
    expect(html).toContain('−320 кр. · внимание −1')
    expect(html).toContain('Для поездки нужно выбрать не менее двух участников.')
    expect(html).toContain('Кого позвать: двое или трое близких.')
    expect(html).toMatch(/<button class="choice"(?![^>]*disabled)[^>]*>[\s\S]*?Записаться на сокращённый курс/)
    expect(html).toMatch(/<button class="choice"[^>]*disabled[^>]*>[\s\S]*?Позвать близких на обзорную палубу/)
  })
  it('shows the domain reason when the course is on cooldown', async () => {
    const s = start()
    s.game = { ...s.game, economy: { ...s.game.economy, lastBought: { 'course-pro': 34 } } }
    const html = await render()
    expect(html).toContain('Следующий курс доступен через 3 года.')
  })
})
