import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../../domain/engine'
import { LIFE_PRESETS } from '../../domain/clock'
import HintCoach from '../../components/play/HintCoach.vue'
import HelpModal from '../../components/play/HelpModal.vue'
import ChroniclePanel from '../../components/panels/ChroniclePanel.vue'
import SceneView from '../../components/scene/SceneView.vue'
import { useGameStore } from '../game'
import { shortYears, years } from '../../ui/format'

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  })
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setActivePinia(undefined)
})

async function render(component: object): Promise<string> {
  const app = createSSRApp({ render: () => h(component) })
  app.use(pinia)
  const context: { teleports?: Record<string, string> } = {}
  const html = await renderToString(app, context)
  return html + (context.teleports?.body ?? '')
}

describe('preset duration hints and age labels', () => {
  it.each(LIFE_PRESETS)('shows the selected $minutes-minute preset duration in both hints', async preset => {
    const store = useGameStore()
    store.begin()

    store.setPreset(preset.minutes)
    expect(store.secondsPerYear).toBe(preset.secondsPerYear)
    expect(await render(HintCoach)).toContain(`Год — около ${preset.secondsPerYear} с на скорости 1×.`)
    expect(await render(HelpModal)).toContain(`на скорости 1× год длится около ${preset.secondsPerYear} с`)
  })

  it('reacts to a preset change through the shared secondsPerYear computed', async () => {
    const store = useGameStore()
    store.begin()
    store.setPreset(30)
    expect(store.secondsPerYear).toBe(22)
    expect(await render(HintCoach)).toContain('Год — около 22 с на скорости 1×.')
    expect(await render(HelpModal)).toContain('на скорости 1× год длится около 22 с')

    store.setPreset(90)
    expect(store.secondsPerYear).toBe(73)
    expect(await render(HintCoach)).toContain('Год — около 73 с на скорости 1×.')
    expect(await render(HelpModal)).toContain('на скорости 1× год длится около 73 с')
  })

  it.each([
    { age: 0, short: '0 л.', full: '0 лет' },
    { age: 1, short: '1 г.', full: '1 год' },
    { age: 2, short: '2 г.', full: '2 года' },
    { age: 3, short: '3 г.', full: '3 года' },
    { age: 4, short: '4 г.', full: '4 года' },
    { age: 5, short: '5 л.', full: '5 лет' },
    { age: 11, short: '11 л.', full: '11 лет' },
    { age: 21, short: '21 г.', full: '21 год' },
    { age: 22, short: '22 г.', full: '22 года' },
    { age: 24, short: '24 г.', full: '24 года' },
    { age: 25, short: '25 л.', full: '25 лет' },
    { age: 100, short: '100 л.', full: '100 лет' },
    { age: 101, short: '101 г.', full: '101 год' },
    { age: 111, short: '111 л.', full: '111 лет' },
    { age: 114, short: '114 л.', full: '114 лет' },
    { age: 121, short: '121 г.', full: '121 год' }
  ])('formats age $age with a short UI label and full accessible label', ({ age, short, full }) => {
    expect(shortYears(age)).toBe(short)
    expect(years(age)).toBe(full)
  })

  it.each([
    { age: 100, short: '100 л.', full: '100 лет' },
    { age: 101, short: '101 г.', full: '101 год' }
  ])('renders long age $age compactly with accessible full labels', async ({ age, short, full }) => {
    const store = useGameStore()
    const game = createGame(14)
    game.age = age
    game.history[0].age = age
    store.game = game

    const chronicle = await render(ChroniclePanel)
    const scene = await render(SceneView)

    expect(chronicle).toMatch(new RegExp(`<time class="entry__age"[^>]*aria-label="${full}"[^>]*>${short}</time>`))
    expect(scene).toMatch(new RegExp(`<span class="scene__when"[^>]*aria-label="${full}"[^>]*>${short}</span>`))
  })
})
