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
    { age: 0, label: '0 лет' },
    { age: 3, label: '3 года' },
    { age: 5, label: '5 лет' }
  ])('uses the age formatter in the chronicle and scene: $label', async ({ age, label }) => {
    const store = useGameStore()
    const game = createGame(14)
    game.age = age
    game.history[0].age = age
    store.game = game

    const chronicle = await render(ChroniclePanel)
    const scene = await render(SceneView)

    expect(chronicle).toMatch(new RegExp(`<time class="entry__age"[^>]*>${label}</time>`))
    expect(chronicle).not.toMatch(/<small[^>]*>л<\/small>/)
    expect(scene).toMatch(new RegExp(`<span class="scene__when"[^>]*>${label}</span>`))
  })
})
