import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { advanceYear, cancelService, canChoose, createGame, dropUnanswerablePending, visibleChoiceIndices, decide, epitaph, getMoment, getStorylet, purchase, resolveText, setFocus, setGoal, setLoad, skipMoment, takeMoment } from '../domain/engine'
import { isKnown } from '../domain/birth'
import type { PurchaseTarget } from '../domain/offers'
import { DEFAULT_PRESET, LIFE_PRESETS, runClock, secondsPerYearFor, beatAt } from '../domain/clock'
import type { LifePreset } from '../domain/clock'
import { randomSeed } from '../domain/random'
import { repairSave } from '../domain/save'
import type { Atmosphere, Focus, GameState, LogEntry, LogKind } from '../domain/types'

const STORAGE_KEY = 'generation17-v2'
const MAX_JUMP_YEARS = 120

interface Saved {
  game: GameState
  started: boolean
  preset: LifePreset
  playedSeconds?: number
}

const HINTS_KEY = 'generation17-hints'
const FEEDBACK_MOMENTS = new Set(['m-night-archive', 'm-call-parent', 'm-terminal-copy'])

function loadHints(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(HINTS_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    const g = saved?.game
    if (g?.schemaVersion !== 2 || !Array.isArray(g.history) || typeof g.rng !== 'number' || !g.stats || !g.ship || !g.birth) return null
    if (!Array.isArray(g.forks)) g.forks = []
    // раньше отметка года называлась season
    const legacy = g as unknown as { season?: number }
    if (typeof g.phase !== 'number') g.phase = (legacy.season ?? 0) as GameState['phase']
    delete legacy.season
    if (!g.atmosphere) g.atmosphere = 'mystery'
    if (!g.director) g.director = { lastAge: g.age, tension: 0, lastCategory: null, lastTone: 'calm' }
    if (!LIFE_PRESETS.some(p => p.minutes === saved.preset)) saved.preset = DEFAULT_PRESET
    // Каталог событий мог измениться с прошлой игры: устаревшие ссылки снимаются, жизнь остаётся.
    const repaired = repairSave(g)
    saved.game = repaired.game
    if (repaired.notes.length) console.warn('Сохранение исправлено:', repaired.notes.join('; '))
    return saved
  } catch {
    return null
  }
}

export type LogFilter = 'all' | LogKind

export const useGameStore = defineStore('game', () => {
  const saved = loadSaved()
  // Состояние иммутабельно: движок возвращает новый объект на каждый шаг. Поэтому shallowRef —
  // реактивный прокси ломает structuredClone внутри движка.
  const game = shallowRef<GameState>(saved?.game ?? createGame(randomSeed()))
  /** false — показан экран рождения, жизнь ещё не началась. */
  const started = ref(saved?.started ?? false)
  const preset = ref<LifePreset>(saved?.preset ?? DEFAULT_PRESET)
  const speed = ref(1)
  const playing = ref(false)
  /** Доля текущего года (0…1). После перезагрузки восстанавливается до последней отметки года. */
  const progress = ref(beatAt(game.value.phase))
  const filter = ref<LogFilter>('all')
  /** Записи хроники, появившиеся от последнего решения: показываются перед продолжением. */
  const result = ref<LogEntry[] | null>(null)
  /** Одноразовый UI-отклик на явный отказ; намеренно не входит в `game` и сохранение. */
  const skipFeedback = ref<{ token: number; text: string } | null>(null)
  let skipFeedbackToken = 0
  const resumeAfter = ref(false)
  /** Окно «Траты и карьера» открыто: время стоит. */
  const shopOpen = ref(false)
  /** Шло ли время до открытия окна. Отдельно от `resumeAfter`, чтобы два сценария не путали возобновление. */
  const shopResume = ref(false)
  /** Сколько реального времени игрок провёл в живой игре (для отчёта тестера). */
  const playedSeconds = ref(saved?.playedSeconds ?? 0)
  const hintsSeen = ref<Record<string, boolean>>(loadHints())
  /** Участники семейной поездки, выбранные в сюжетном решении (T7); привязаны к решению и не переходят в следующее. */
  const storyPick = ref<{ decision: string; ids: string[] }>({ decision: '', ids: [] })

  const secondsPerYear = computed(() => secondsPerYearFor(preset.value))
  const hasDecision = computed(() => !!game.value.pending)
  const currentEvent = computed(() => getStorylet(game.value))
  const visibleChoices = computed(() => visibleChoiceIndices(game.value))
  const currentMoment = computed(() => getMoment(game.value))
  /** Сколько осталось у момента, 1 → 0. Момент живёт до следующей отметки года. */
  const momentLeft = computed(() => Math.max(0, Math.min(1, 1 - (progress.value - game.value.phase / 4) * 4)))
  const remaining = computed(() => Math.max(0, 340 - game.value.shipYear))
  const finalText = computed(() => epitaph(game.value))
  const blocked = computed(() => hasDecision.value || game.value.stopped || !!result.value || shopOpen.value)
  /** Магазин открывается с 16 лет в живой игре без ожидающего решения и результата. */
  const canOpenShop = computed(() => started.value && !game.value.stopped && !game.value.pending && !result.value && game.value.age >= 16)
  const decisionKey = computed(() => game.value.pending ? `${game.value.seed}:${game.value.age}:${game.value.pending}` : '')
  const storyParticipants = computed(() => storyPick.value.decision === decisionKey.value ? storyPick.value.ids : [])
  const latest = computed(() => filter.value === 'all'
    ? game.value.history
    : game.value.history.filter(h => h.kind === filter.value))

  watch(game, () => persist())
  watch(game, (next, previous) => {
    if (next.moment && next.moment !== previous.moment || next.pending || next.stopped) clearSkipFeedback()
  }, { flush: 'sync' })
  watch([started, preset], () => persist())
  watch([started, shopOpen, result], ([isStarted, isShopOpen, visibleResult]) => {
    if (!isStarted || isShopOpen || visibleResult !== null) clearSkipFeedback()
  }, { flush: 'sync' })

  function clearSkipFeedback(token?: number): boolean {
    const current = skipFeedback.value
    if (!current || token !== undefined && current.token !== token) return false
    skipFeedback.value = null
    return true
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game: game.value, started: started.value, preset: preset.value, playedSeconds: Math.round(playedSeconds.value) } satisfies Saved))
    } catch {
      // Хранилище может быть недоступно: игра продолжит работу в текущей вкладке
    }
  }

  function settle() {
    if (game.value.pending || game.value.stopped) {
      resumeAfter.value = playing.value && !!game.value.pending
      playing.value = false
    }
  }

  /** Вызывается каждый кадр. `dt` — секунды реального времени. */
  function frame(dt: number) {
    game.value = dropUnanswerablePending(game.value)
    if (!started.value || !playing.value || blocked.value) return
    playedSeconds.value += Math.min(dt, .1)
    const r = runClock(game.value, progress.value, Math.min(dt, .1), speed.value, secondsPerYear.value)
    progress.value = r.progress
    if (r.game !== game.value) game.value = r.game
    settle()
  }

  function step() {
    if (blocked.value) return
    game.value = advanceYear(game.value)
    progress.value = 0
    resumeAfter.value = false
    settle()
  }

  function runToDecision() {
    if (blocked.value) return
    playing.value = false
    for (let i = 0; i < MAX_JUMP_YEARS && !game.value.pending && !game.value.stopped; i++) {
      game.value = advanceYear(game.value)
    }
    progress.value = 0
    resumeAfter.value = false
  }

  /** Цель сюжетной покупки для варианта: только выбранные игроком участники, никаких подстановок. */
  function storyTarget(index: number): PurchaseTarget | undefined {
    return currentEvent.value?.choices[index]?.purchase?.offer === 'family-trip'
      ? { participantIds: [...storyParticipants.value] }
      : undefined
  }

  function toggleStoryParticipant(id: string) {
    if (!decisionKey.value) return
    const selected = storyParticipants.value
    storyPick.value = { decision: decisionKey.value, ids: selected.includes(id) ? selected.filter(x => x !== id) : selected.length >= 3 ? selected : [...selected, id] }
  }

  function chooseVisible(visibleIndex: number) {
    const index = visibleChoices.value[visibleIndex]
    if (index !== undefined) choose(index)
  }

  function choose(index: number) {
    const target = storyTarget(index)
    if (!canChoose(game.value, index, target).available) return
    const before = game.value.nextLogId
    const next = decide(game.value, index, target)
    if (next === game.value) return
    clearSkipFeedback()
    seeHint('decision')
    game.value = next
    result.value = game.value.history.filter(h => h.id >= before).reverse()
  }

  function continueAfterResult() {
    result.value = null
    if (resumeAfter.value && !game.value.stopped) playing.value = true
    resumeAfter.value = false
  }

  function acceptMoment() {
    if (shopOpen.value) return
    const before = game.value
    const next = takeMoment(before)
    if (next !== before && next.moment === null) clearSkipFeedback()
    game.value = next
  }

  function dismissMoment(expectedMomentId?: string): boolean {
    const before = game.value
    if (!started.value || shopOpen.value || before.pending || before.stopped || result.value !== null || !before.moment
      || expectedMomentId !== undefined && before.moment !== expectedMomentId) return false
    const def = getMoment(before)
    if (!def) return false
    const feedbackText = FEEDBACK_MOMENTS.has(def.id) && def.skip.result
      && (def.id !== 'm-call-parent' || isKnown(before, 'parent'))
      ? resolveText(before, def.skip.result)
      : null
    const next = skipMoment(before)
    if (next === before || next.moment !== null) return false
    game.value = next
    clearSkipFeedback()
    if (feedbackText) skipFeedback.value = { token: ++skipFeedbackToken, text: feedbackText }
    return true
  }

  function changeFocus(focus: Focus) {
    game.value = setFocus(game.value, focus)
  }

  function changeSpeed(next: number) {
    speed.value = next
  }

  function togglePlay() {
    if (blocked.value) {
      playing.value = false
      return
    }
    playing.value = !playing.value
  }

  function openShop() {
    if (shopOpen.value || !canOpenShop.value) return
    clearSkipFeedback()
    shopResume.value = playing.value
    playing.value = false
    shopOpen.value = true
  }

  function closeShop() {
    if (!shopOpen.value) return
    shopOpen.value = false
    const resume = shopResume.value
    shopResume.value = false
    if (resume && !blocked.value) playing.value = true
  }

  /** Покупка целиком на доменном слое: он повторно проверяет доступность. `false` — ничего не изменилось. */
  function buy(offerId: string, target?: PurchaseTarget): boolean {
    if (!started.value) return false
    const next = purchase(game.value, offerId, target)
    if (next === game.value) return false
    game.value = next
    return true
  }

  /** Смена нагрузки целиком на доменном слое: без списаний, личного времени и RNG. `false` — ничего не изменилось. */
  function changeLoad(nextLoad: number): boolean {
    if (!started.value) return false
    const next = setLoad(game.value, nextLoad)
    if (next === game.value) return false
    game.value = next
    return true
  }

  /** Цель накопления: бесплатно, без хроники и RNG. `null` снимает цель. `false` — ничего не изменилось. */
  function chooseGoal(offerId: string | null): boolean {
    if (!started.value) return false
    const next = setGoal(game.value, offerId)
    if (next === game.value) return false
    game.value = next
    return true
  }

  function cancelServiceById(serviceId: string): boolean {
    if (!started.value) return false
    const next = cancelService(game.value, serviceId)
    if (next === game.value) return false
    game.value = next
    return true
  }

  function begin() {
    started.value = true
    playing.value = true
  }

  function newLife(seed?: number) {
    clearSkipFeedback()
    playing.value = false
    resumeAfter.value = false
    shopOpen.value = false
    shopResume.value = false
    result.value = null
    progress.value = 0
    filter.value = 'all'
    playedSeconds.value = 0
    game.value = createGame(seed ?? randomSeed(), game.value.atmosphere)
    started.value = false
  }

  /** Атмосферу выбирают на экране рождения, до начала жизни. */
  function setAtmosphere(next: Atmosphere) {
    if (started.value) return
    game.value = { ...game.value, atmosphere: next }
  }

  function seeHint(id: string) {
    if (hintsSeen.value[id]) return
    hintsSeen.value = { ...hintsSeen.value, [id]: true }
    try {
      localStorage.setItem(HINTS_KEY, JSON.stringify(hintsSeen.value))
    } catch {
      // подсказки просто покажутся ещё раз
    }
  }

  function setPreset(next: LifePreset) {
    preset.value = next
  }

  return {
    game, started, preset, playedSeconds, hintsSeen, storyParticipants, storyTarget, toggleStoryParticipant, speed, playing, progress, filter, result, shopOpen, canOpenShop, skipFeedback,
    visibleChoices, chooseVisible, secondsPerYear, hasDecision, currentEvent, currentMoment, momentLeft, remaining, finalText, blocked, latest,
    frame, step, runToDecision, openShop, closeShop, buy, changeLoad, chooseGoal, cancelServiceById, choose, continueAfterResult, acceptMoment, dismissMoment, clearSkipFeedback,
    changeFocus, changeSpeed, togglePlay, begin, newLife, setPreset, setAtmosphere, seeHint
  }
})
