import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createGame } from '../../domain/engine'
import type { DeathNotice } from '../../domain/deathNotices'
import DeathNotices from '../../components/panels/DeathNotices.vue'
import { useGameStore } from '../game'

function makeNotice(id: string, shipYear: number, name: string, role: string): DeathNotice {
  return { personId: id, shipYear, personName: name, role, personAge: 78, wasCurrentPartner: false }
}

async function renderNotices(notices: DeathNotice[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useGameStore()
  const game = createGame(43)
  for (const notice of notices) {
    let person = game.people.find(candidate => candidate.id === notice.personId)
    if (!person) {
      person = { id: notice.personId, name: notice.personName, role: notice.role, gender: 'f', age: notice.personAge, alive: false, since: 0, bond: 50 }
      game.people.push(person)
    }
    person.name = notice.personName
    person.role = notice.role
    person.age = notice.personAge
    person.alive = false
  }
  store.game = game
  store.pendingDeathNotices = notices

  const app = createSSRApp(DeathNotices)
  app.use(pinia)
  return { html: await renderToString(app), store }
}

describe('DeathNotices compact summary', () => {
  afterEach(() => setActivePinia(undefined))

  it('keeps the single-notice presentation and announces the actual death', async () => {
    const notice = makeNotice('parent', 212, 'Ория Марек', 'Мать')
    const { html } = await renderNotices([notice])

    expect(html).toContain('Известие о близких')
    expect(html).toContain('Умерла мама — Ория Марек (78 лет).')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Мать · год полёта 212')
    expect(html).not.toContain('death-notices__summary')
  })

  it.each([
    { count: 2, remaining: 'Ещё 1 известие.' },
    { count: 5, remaining: 'Ещё 4 известия.' },
    { count: 6, remaining: 'Ещё 5 известий.' }
  ])('previews the first of $count notices, announces its name, and keeps the full list behind expand', async ({ count, remaining }) => {
    const ids = ['parent', 'parent2', 'sibling', 'child', 'friend', 'neighbor']
    const notices = Array.from({ length: count }, (_, index) =>
      makeNotice(ids[index], 210 + index, `Имя ${index + 1}`, `Роль ${index + 1}`))
    const { html, store } = await renderNotices(notices)

    expect(html).toContain('Умерла мама — Имя 1 (78 лет).')
    expect(html).toContain('Роль 1 · год полёта 210')
    expect(html).toContain(remaining)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls="death-notices-list"')
    expect(html).toContain('aria-live="polite"')
    expect(html.match(/aria-live=/g)).toHaveLength(1)
    expect(html).toContain('Умерла мама — Имя 1 (78 лет). Роль 1 · год полёта 210. ' + remaining)
    expect(html).toContain('style="display:none;"')
    for (let index = 1; index <= count; index++) expect(html).toContain(`Имя ${index}`)
    expect(store.pendingDeathNotices).toHaveLength(count)
  })
})
