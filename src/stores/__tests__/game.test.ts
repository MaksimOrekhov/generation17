import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import { useHotkeys } from '../../composables/useHotkeys'
import { advanceYear, createGame, skipMoment, takeMoment } from '../../domain/engine'
import { moments } from '../../domain/moments'
import { useGameStore } from '../game'

type TestNode = { type: string; children: TestNode[]; props: Record<string, unknown>; parent: TestNode | null; text?: string }
const testRenderer = createRenderer({
  createElement: (type: string): TestNode => ({ type, children: [], props: {}, parent: null }),
  createText: (text: string): TestNode => ({ type: '#text', children: [], props: {}, parent: null, text }),
  createComment: (text: string): TestNode => ({ type: '#comment', children: [], props: {}, parent: null, text }),
  setText: (node: TestNode, text: string) => { node.text = text },
  setElementText: (node: TestNode, text: string) => { node.children = []; node.text = text },
  patchProp: (node: TestNode, key: string, _previous: unknown, next: unknown) => { node.props[key] = next },
  insert: (node: TestNode, parent: TestNode, anchor?: TestNode | null) => {
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(node)
    else parent.children.splice(index, 0, node)
  },
  remove: (node: TestNode) => {
    if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node)
    node.parent = null
  },
  parentNode: (node: TestNode) => node.parent,
  nextSibling: (node: TestNode) => {
    if (!node.parent) return null
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
  }
} as never)

function mountTestComponent(component: ReturnType<typeof defineComponent>) {
  const root: TestNode = { type: 'root', children: [], props: {}, parent: null }
  const app = testRenderer.createApp(component)
  app.mount(root as never)
  return { app, root }
}

const pilotMoments = ['m-night-archive', 'm-call-parent', 'm-terminal-copy'] as const
const pilotAges = { 'm-night-archive': 13, 'm-call-parent': 18, 'm-terminal-copy': 10 }
const approvedMomentCopy = {
  'm-night-archive': {
    text: 'В учебном архиве свободен терминал. На экране — два коротких урока. Свет в коридоре уже приглушили.',
    accept: 'Ты проходишь оба урока. Второе задание даётся не сразу, но теперь ты знаешь, как к нему подступиться.',
    skip: 'Ты закрываешь учебный каталог и идёшь спать. В коридоре стихает шум чужих разговоров.'
  },
  'm-call-parent': {
    text: 'Мама звонит узнать, ел ли ты сегодня. Слышно, как она ставит чайник. «Заглянешь, если есть время?»',
    accept: 'Пирог осел посередине. «Так и задумано», — смеётся мама. За чаем вы вспоминаете семейные истории.',
    skip: 'Ты говоришь, что сегодня не заедешь. Мама чуть медлит: «Хорошо, береги себя».'
  },
  'm-terminal-copy': {
    text: 'На школьном терминале открыт список файлов. Среди них — папка без подписи со значком замка. Рядом кнопка копирования.',
    accept: 'Ты копируешь папку и сохраняешь её среди домашних заданий. В коридоре замечаешь, что ладони вспотели.',
    skip: 'Ты закрываешь список файлов, не открывая папку. В коридоре продолжается обычный школьный день.'
  }
} as const

function withMoment(id: typeof pilotMoments[number]) {
  const store = useGameStore()
  const game = createGame(90210)
  game.age = pilotAges[id]
  game.moment = id
  game.momentLog[id] = game.age
  store.game = game
  store.begin()
  return store
}

describe('хранилище игры', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('ход времени работает через реактивное хранилище (без ошибок клонирования)', () => {
    const store = useGameStore()
    store.begin()
    store.changeSpeed(16)
    const seed = store.game.seed
    for (let i = 0; i < 4000 && !store.blocked; i++) store.frame(.1)
    expect(store.game.seed).toBe(seed)
    expect(store.game.age).toBeGreaterThan(0)
  })

  it('останавливается на решении и продолжает после результата', () => {
    const store = useGameStore()
    store.begin()
    store.changeSpeed(16)
    for (let i = 0; i < 20000 && !store.game.pending && !store.game.stopped; i++) store.frame(.1)
    if (!store.game.pending) return
    expect(store.playing).toBe(false)
    const age = store.game.age
    store.frame(5)
    expect(store.game.age).toBe(age)
    store.choose(0)
    expect(store.result?.length).toBeGreaterThan(0)
    store.frame(5)
    expect(store.game.age).toBe(age)
    store.continueAfterResult()
    expect(store.playing).toBe(true)
  })

  it('моменты принимаются и пропускаются', () => {
    const store = useGameStore()
    store.begin()
    store.changeSpeed(16)
    for (let i = 0; i < 40000 && !store.game.moment && !store.blocked; i++) store.frame(.1)
    if (!store.game.moment) return
    const attention = store.game.attention
    store.acceptMoment()
    expect(store.game.attention).toBe(attention - 1)
    expect(store.game.moment).toBeNull()
  })

  it('новая жизнь возвращает на экран рождения', () => {
    const store = useGameStore()
    store.begin()
    store.newLife()
    expect(store.started).toBe(false)
    expect(store.playing).toBe(false)
    expect(store.game.age).toBe(0)
  })

  it.each(pilotMoments)('%s: accept сохраняет прежнюю цену и пишет один обычный результат', id => {
    const store = withMoment(id)
    const before = structuredClone(store.game)
    const expected = takeMoment(before)
    const moment = moments.find(item => item.id === id)!

    expect(moment.text.length).toBeGreaterThanOrEqual(60)
    expect(moment.text.length).toBeLessThanOrEqual(130)
    expect(moment.text).toBe(approvedMomentCopy[id].text)
    expect(moment.accept.result).toBe(approvedMomentCopy[id].accept)
    expect(moment.skip.result).toBe(approvedMomentCopy[id].skip)

    store.acceptMoment()

    expect(store.game).toEqual(expected)
    expect(store.game.attention).toBe(before.attention - 1)
    expect(store.game.history.filter(x => x.kind === 'moment')).toHaveLength(before.history.filter(x => x.kind === 'moment').length + 1)
    expect(store.skipFeedback).toBeNull()
    if (id === 'm-terminal-copy') {
      expect(store.game.flags.archiveCopy).toBe(true)
      expect(store.game.memories).toEqual(expected.memories)
    }
  })

  it.each(pilotMoments)('%s: explicit skip бесплатно применяет прежние эффекты ровно один раз и даёт временный отклик', id => {
    const store = withMoment(id)
    store.game = { ...store.game, attention: 0 }
    const before = structuredClone(store.game)
    const definition = moments.find(moment => moment.id === id)!
    const result = definition.skip.result!

    store.acceptMoment()
    expect(store.game).toEqual(before)

    expect(store.dismissMoment(id)).toBe(true)
    const after = structuredClone(store.game)
    expect(after).toEqual(skipMoment(before))
    expect(after.moment).toBeNull()
    expect(after.attention).toBe(before.attention)
    expect(after.rng).toBe(before.rng)
    expect(after.history).toEqual(before.history)
    expect(after.nextLogId).toBe(before.nextLogId)
    expect(after.memories).toEqual(before.memories)
    expect(after.flags).toEqual(before.flags)
    expect(after.momentLog).toEqual(before.momentLog)
    if (id === 'm-night-archive') expect(after.stats.stress).toBeLessThan(before.stats.stress)
    if (id === 'm-call-parent') expect(after.stats.bonds).toBeLessThan(before.stats.bonds)
    if (id === 'm-terminal-copy') expect(after.stats).toEqual(before.stats)
    expect(store.skipFeedback?.text).toBe(result)
    expect(store.skipFeedback?.token).toBeGreaterThan(0)

    expect(store.dismissMoment(id)).toBe(false)
    expect(store.game).toEqual(after)
    expect(store.skipFeedback?.token).toBeGreaterThan(0)
  })

  it.each(pilotMoments)('%s: expiry is silent and matches a year advanced without the offered moment', id => {
    const store = withMoment(id)
    const offered = structuredClone(store.game)
    offered.phase = 3
    for (const moment of moments) offered.momentLog[moment.id] = offered.age
    store.game = offered
    const expected = advanceYear({ ...offered, moment: null })

    store.step()

    expect(store.game).toEqual(expected)
    expect(store.skipFeedback).toBeNull()
  })

  it('подавляет stale reply матери и отклоняет старый обработчик при новом моменте', () => {
    for (const mutate of [
      (g: ReturnType<typeof createGame>) => { g.people.find(p => p.id === 'parent')!.alive = false },
      (g: ReturnType<typeof createGame>) => { g.people.find(p => p.id === 'parent')!.state = { availability: 'distant' } },
      (g: ReturnType<typeof createGame>) => { g.people.find(p => p.id === 'parent')!.since = g.age + 1 }
    ]) {
      const store = withMoment('m-call-parent')
      mutate(store.game)
      const bonds = store.game.stats.bonds
      expect(store.dismissMoment('m-call-parent')).toBe(true)
      expect(store.game.stats.bonds).toBe(bonds - 1)
      expect(store.skipFeedback).toBeNull()
    }

    const store = withMoment('m-night-archive')
    const before = structuredClone(store.game)
    store.game = { ...store.game, moment: 'm-terminal-copy' }
    const afterNewOffer = structuredClone(store.game)
    expect(store.dismissMoment('m-night-archive')).toBe(false)
    expect(store.game).toEqual(afterNewOffer)
    expect(store.skipFeedback).toBeNull()
    expect(before.moment).toBe('m-night-archive')
  })

  it('не закрывает момент при pending/shopOpen/смерти и очищает отклик при их появлении', () => {
    const store = withMoment('m-night-archive')
    store.dismissMoment()
    expect(store.skipFeedback).not.toBeNull()

    store.game = { ...store.game, moment: 'm-terminal-copy' }
    expect(store.skipFeedback).toBeNull()
    store.dismissMoment()
    store.game = { ...store.game, pending: 'school-track' }
    const withPending = store.game
    expect(store.skipFeedback).toBeNull()
    expect(store.dismissMoment()).toBe(false)
    expect(store.game).toBe(withPending)

    store.game = { ...store.game, age: 18, pending: null, moment: 'm-call-parent' }
    store.dismissMoment()
    store.openShop()
    expect(store.skipFeedback).toBeNull()
    expect(store.dismissMoment()).toBe(false)
    store.closeShop()

    store.game = { ...store.game, moment: 'm-night-archive' }
    store.dismissMoment()
    store.game = { ...store.game, stopped: true }
    expect(store.skipFeedback).toBeNull()
    expect(store.dismissMoment()).toBe(false)
  })

  it('новая жизнь и reload не восстанавливают runtime-only отклик; старый token не очищает новый', async () => {
    const records = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key)
    })
    const store = withMoment('m-night-archive')
    store.dismissMoment()
    const oldToken = store.skipFeedback!.token
    await nextTick()
    expect(records.get('generation17-v2')).not.toContain('skipFeedback')

    store.game = { ...store.game, moment: 'm-terminal-copy' }
    store.dismissMoment()
    const newToken = store.skipFeedback!.token
    expect(store.clearSkipFeedback(oldToken)).toBe(false)
    expect(store.skipFeedback?.token).toBe(newToken)

    store.newLife(90210)
    expect(store.skipFeedback).toBeNull()
    setActivePinia(createPinia())
    expect(useGameStore().skipFeedback).toBeNull()
  })

  it('Esc использует тот же явный dismiss и выводит feedback', () => {
    const store = withMoment('m-night-archive')
    const listeners = new Map<string, (event: KeyboardEvent) => void>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener as (event: KeyboardEvent) => void),
      removeEventListener: (type: string) => listeners.delete(type)
    })
    const { app } = mountTestComponent(defineComponent({
      setup() {
        useHotkeys(() => true)
        return () => h('div')
      }
    }))

    listeners.get('keydown')!({ key: 'Escape', code: 'Escape', altKey: false, ctrlKey: false, metaKey: false, target: null } as unknown as KeyboardEvent)

    expect(store.game.moment).toBeNull()
    expect(store.skipFeedback?.text).toBe(moments.find(moment => moment.id === 'm-night-archive')!.skip.result)
    app.unmount()
  })

  it('старое сохранение с активным моментом продолжает работать без transient feedback', () => {
    const records = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key)
    })
    const legacy = createGame(773)
    legacy.age = 13
    legacy.moment = 'm-night-archive'
    legacy.momentLog[legacy.moment] = legacy.age
    records.set('generation17-v2', JSON.stringify({ game: legacy, started: true, preset: 60 }))
    setActivePinia(createPinia())

    const restored = useGameStore()
    expect(restored.game.moment).toBe('m-night-archive')
    expect(restored.skipFeedback).toBeNull()
    expect(restored.dismissMoment()).toBe(true)
    expect(restored.skipFeedback?.text).toBe(moments.find(moment => moment.id === 'm-night-archive')!.skip.result)
  })
})
