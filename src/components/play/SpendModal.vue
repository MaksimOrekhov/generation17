<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { groupDigits, workFinanceView } from '../../domain/economyView'
import type { Job, SectorId } from '../../domain/types'
import { spendView } from '../../domain/spendView'
import type { OfferView, SpendTab } from '../../domain/spendView'
import { useGameStore } from '../../stores/game'
import { years } from '../../ui/format'
import ModalShell from '../common/ModalShell.vue'
import CareerPanel from './CareerPanel.vue'
import LoadPanel from './LoadPanel.vue'
import ParticipantPicker from './ParticipantPicker.vue'
import ProfessionPicker from './ProfessionPicker.vue'
import SectorPicker from './SectorPicker.vue'

const MAX_PARTICIPANTS = 3

defineEmits<{ close: [] }>()

const store = useGameStore()

// Локальный выбор игрока; допустимость проверяет доменный слой через spendView().
const pickedSector = ref<SectorId | null>(null)
const pickedPeople = ref<string[]>([])
const pickedJob = ref<Job | null>(null)
// Игра иммутабельна (shallowRef): всё окно пересчитывается при каждой замене состояния.
const view = computed(() => spendView(store.game, { sectorId: pickedSector.value, participantIds: pickedPeople.value, job: pickedJob.value }))
const forecast = computed(() => workFinanceView(store.game).forecast)

const tabs: { id: SpendTab; label: string }[] = [
  { id: 'offers', label: 'Возможности' },
  { id: 'work', label: 'Работа' },
  { id: 'mine', label: 'Моё' },
  { id: 'history', label: 'История' }
]
const tab = ref<SpendTab>('offers')
/** Ключ ожидающего подтверждения: предложение + выбранная цель + фактическая стоимость. */
const confirming = ref<string | null>(null)
const notes = ref<Record<string, { ok: boolean; text: string }>>({})

const DONE: Record<string, string> = {
  'course-pro': 'Курс пройден. Навык повышен, курс учтён.',
  'own-cabin': 'Собственная каюта оформлена.',
  'dome-pass': 'Абонемент подключён.'
}
const body = ref<HTMLElement | null>(null)

// Устаревший выбор (человек умер, сектор посещён) снимается сам.
watch(() => view.value.selection, sel => {
  if (pickedSector.value !== sel.sectorId) pickedSector.value = sel.sectorId
  if (pickedPeople.value.join() !== sel.participantIds.join()) pickedPeople.value = sel.participantIds
  if (pickedJob.value !== sel.job) pickedJob.value = sel.job
})

// Любое изменение игры (даже без смены ключа: бесплатный абонемент, нагрузка) и любая смена выбора сбрасывает подтверждение.
watch(() => store.game, () => { confirming.value = null })
watch([pickedSector, pickedPeople, pickedJob], () => { confirming.value = null })
watch(view, v => {
  if (confirming.value && !v.offers.some(o => o.confirmKey === confirming.value)) confirming.value = null
})

function selectTab(next: SpendTab) {
  tab.value = next
  confirming.value = null
  notes.value = {}
}

function pickSector(id: SectorId) {
  pickedSector.value = pickedSector.value === id ? null : id
}

function pickJob(job: Job) {
  pickedJob.value = pickedJob.value === job ? null : job
}

/** Кнопка во вкладке «Работа» ведёт к той же карточке переобучения: процедура покупки одна. */
async function goRetrain() {
  selectTab('offers')
  await nextTick()
  const card = body.value?.querySelector<HTMLElement>('[data-offer="retrain"]')
  if (!card) return
  // Шапка окна липкая: карточка не должна прятаться под ней.
  const head = card.closest('.spend')?.querySelector<HTMLElement>('.spend__head')
  card.style.scrollMarginTop = `${(head?.offsetHeight ?? 0) + 8}px`
  card.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function toggleGoal(o: OfferView) {
  store.chooseGoal(o.isGoal ? null : o.id)
}

function togglePerson(id: string) {
  const list = pickedPeople.value
  pickedPeople.value = list.includes(id) ? list.filter(x => x !== id) : list.length < MAX_PARTICIPANTS ? [...list, id] : list
}

function doneText(o: OfferView): string {
  if (o.kind === 'sector') {
    const name = o.sectorOptions.find(x => x.id === o.target?.sectorId)?.name ?? 'сектор'
    return `Экскурсия состоялась: ${name}. Знания могли вырасти, память о месте сохранена.`
  }
  if (o.kind === 'family') {
    const names = o.participantOptions.filter(x => o.target?.participantIds?.includes(x.id)).map(x => x.name)
    return `Неделя вместе: ${names.join(' и ')}. Связь с каждым укрепилась (до +2), запись добавлена в хронику.`
  }
  if (o.kind === 'profession') {
    const internship = o.retrain?.timeline[0] ?? 'Стажировка начнётся с ближайшего годового расчёта.'
    return `Переобучение оформлено: ${store.game.protagonist.job} → ${o.target?.job ?? ''}. ${internship} Запись добавлена в хронику.`
  }
  return o.buttonLabel === 'Восстановить бесплатно' ? 'Прежняя каюта восстановлена.' : DONE[o.id]!
}

function act(clicked: OfferView) {
  // Быстрый повторный клик приходит со старой карточкой: решает актуальное состояние, а не то, что видел игрок.
  const offer = view.value.offers.find(o => o.id === clicked.id)
  if (!offer?.available) return
  if (offer.confirmKey && confirming.value !== offer.confirmKey) {
    confirming.value = offer.confirmKey
    return
  }
  confirming.value = null
  const text = doneText(offer)
  const ok = store.buy(offer.id, offer.target ?? undefined)
  if (ok) {
    if (offer.kind === 'sector') pickedSector.value = null
    if (offer.kind === 'family') pickedPeople.value = []
    if (offer.kind === 'profession') pickedJob.value = null
  }
  const after = view.value.offers.find(o => o.id === offer.id)
  notes.value = {
    ...notes.value,
    [offer.id]: ok ? { ok, text } : { ok, text: `Не удалось: ${after?.reason ?? 'предложение недоступно.'}` }
  }
}

function cancel(id: string) {
  if (store.cancelServiceById(id)) notes.value = { ...notes.value, [id]: { ok: true, text: 'Абонемент отменён. Будущий платёж убран из прогноза.' } }
}

function changeLoad(next: 1 | 0.6) {
  const reason = view.value.work.load.action.reason
  const ok = store.changeLoad(next)
  notes.value = {
    ...notes.value,
    load: ok
      ? { ok, text: next === 0.6 ? 'Решено: 0,6 ставки. Ничего не списано. Новая нагрузка и дополнительная единица личного времени начнут действовать со следующего игрового года.' : 'Решено: полная ставка со следующего игрового года. Ничего не списано; личное время этого года остаётся как есть.' }
      : { ok, text: `Не удалось: ${reason ?? 'изменение недоступно.'}` }
  }
}

const buttonText = (o: OfferView) => confirming.value !== null && confirming.value === o.confirmKey ? o.confirmLabel : o.buttonLabel
</script>

<template>
  <ModalShell label="Траты и карьера" tone="neutral" closable wide @close="$emit('close')">
    <div class="spend">
      <header class="spend__head">
        <div class="spend__top">
          <h2 class="spend__title">Траты и карьера</h2>
          <button type="button" class="btn btn--sm spend__close" aria-label="Закрыть окно" @click="$emit('close')">Закрыть ✕</button>
        </div>
        <dl class="spend__stats">
          <div><dt>Баланс</dt><dd class="spend__money" data-test="balance">{{ view.balanceText }}</dd></div>
          <div><dt>Личное время</dt><dd class="spend__time" data-test="attention" :aria-label="view.time.counter">{{ view.time.left }}/{{ view.time.limit }}</dd></div>
          <div v-if="forecast"><dt>Прогноз за год</dt><dd :class="`spend__fc--${forecast.direction}`" data-test="forecast">{{ forecast.deltaText }} → {{ groupDigits(forecast.after) }}</dd></div>
        </dl>
        <p class="spend__basis" data-test="time-basis">
          {{ view.time.basisText }}<template v-if="view.time.emptyText"> · {{ view.time.emptyText }}</template><template v-if="view.time.next"> · <span data-test="time-next">{{ view.time.next.text }}</span></template>
        </p>
        <div class="spend__tabs" role="tablist" aria-label="Разделы">
          <button
            v-for="t in tabs" :id="`spend-tab-${t.id}`" :key="t.id" type="button" role="tab"
            class="spend__tab" :aria-selected="tab === t.id" :aria-controls="'spend-panel'" @click="selectTab(t.id)"
          >{{ t.label }}</button>
        </div>
      </header>

      <div id="spend-panel" ref="body" class="spend__body" role="tabpanel" :aria-labelledby="`spend-tab-${tab}`">
        <template v-if="tab === 'offers'">
          <section v-if="view.goal" class="goal" aria-label="Цель накопления" data-test="goal">
            <div class="goal__head">
              <p class="goal__title"><span class="goal__tag">Цель</span> {{ view.goal.title }}</p>
              <button type="button" class="btn btn--sm btn--ghost" data-test="goal-clear" @click="store.chooseGoal(null)">Снять цель</button>
            </div>
            <p v-if="view.goal.costText" class="goal__line">{{ view.goal.costText }} · {{ view.goal.savedText }}<template v-if="view.goal.percent !== null"> ({{ view.goal.percent }}%)</template></p>
            <p v-else class="goal__line">{{ view.goal.savedText }}</p>
            <div v-if="view.goal.percent !== null" class="goal__bar" role="progressbar" aria-label="Накоплено для цели" :aria-valuenow="view.goal.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${view.goal.percent}%` }" /></div>
            <p v-if="view.goal.etaText" class="goal__line" :class="{ 'goal__line--ok': view.goal.enough }" data-test="goal-eta">{{ view.goal.etaText }}</p>
            <p v-if="view.goal.conditionText" class="goal__cond" data-test="goal-cond">{{ view.goal.conditionText }}</p>
            <p class="goal__fine">Цель ничего не резервирует и ничего не покупает сама: это просто ориентир.</p>
          </section>
          <article v-for="o in view.offers" :key="o.id" class="offer" :class="{ 'offer--off': !o.available && !o.active }" :data-offer="o.id">
            <div class="offer__head">
              <h3 class="offer__title">{{ o.title }}</h3>
              <span class="offer__status" :class="{ 'offer__status--on': o.active }">{{ o.statusText }}</span>
            </div>
            <p class="offer__text">{{ o.description }}</p>
            <ul class="offer__facts">
              <li v-if="o.oneTimeText">{{ o.oneTimeText }}</li>
              <li v-if="o.annualText">{{ o.annualText }}</li>
              <li v-if="o.attentionText">{{ o.attentionText }}</li>
            </ul>
            <p v-if="o.resultText" class="offer__opens">{{ o.resultText }}</p>
            <ul v-if="o.consequences.length" class="offer__cons">
              <li v-for="c in o.consequences" :key="c">{{ c }}</li>
            </ul>
            <p v-for="line in o.opens" :key="line" class="offer__opens">Открывает: {{ line }}</p>
            <SectorPicker v-if="o.kind === 'sector' && o.stage !== 'unavailable'" :options="o.sectorOptions" :selected="view.selection.sectorId" @select="pickSector" />
            <ParticipantPicker v-if="o.kind === 'family' && o.stage !== 'unavailable'" :options="o.participantOptions" :selected="view.selection.participantIds" :max="MAX_PARTICIPANTS" @toggle="togglePerson" />
            <ProfessionPicker v-if="o.kind === 'profession' && o.jobOptions.length" :options="o.jobOptions" :selected="view.selection.job" :forecast="o.retrain" @select="pickJob" />
            <p v-if="o.hint" class="offer__hint" data-test="hint">{{ o.hint }}</p>
            <p v-if="o.cooldownText" class="offer__hint" data-test="cooldown">{{ o.cooldownText }}</p>
            <p v-for="w in (o.available ? o.warnings : [])" :key="w" class="offer__warn" role="note">⚠ {{ w }}</p>
            <p v-if="o.reason" class="offer__reason" :class="{ 'offer__reason--info': o.active }" data-test="reason">{{ o.reason }}</p>
            <div class="offer__act">
              <button
                type="button" class="btn offer__btn" :class="confirming !== null && confirming === o.confirmKey ? 'btn--primary' : 'btn--accent'"
                :disabled="!o.available" data-test="action" @click="act(o)"
              >{{ buttonText(o) }}</button>
              <button v-if="confirming !== null && confirming === o.confirmKey" type="button" class="btn btn--ghost" @click="confirming = null">Отмена</button>
              <button
                v-else type="button" class="btn btn--sm btn--ghost offer__goal"
                :aria-pressed="o.isGoal" data-test="goal-toggle" @click="toggleGoal(o)"
              >{{ o.isGoal ? 'Цель · снять' : 'Сделать целью' }}</button>
            </div>
            <p v-if="notes[o.id]" class="offer__note" :class="{ 'offer__note--bad': !notes[o.id]!.ok }" role="status">{{ notes[o.id]!.text }}</p>
          </article>
        </template>

        <template v-else-if="tab === 'work'">
          <dl class="rows">
            <div v-for="r in view.work.rows" :key="r.label" class="rows__row"><dt>{{ r.label }}</dt><dd>{{ r.value }}</dd></div>
          </dl>
          <CareerPanel :career="view.work.career" :retirement="view.work.retirement" @retrain="goRetrain" />
          <LoadPanel :load="view.work.load" :note="notes.load ?? null" @change="changeLoad" />
        </template>

        <template v-else-if="tab === 'mine'">
          <section class="block">
            <h3 class="block__title">Жильё</h3>
            <p class="block__main">{{ view.mine.housing.name }}</p>
            <p class="block__sub">{{ view.mine.housing.costText }}</p>
            <p v-if="view.mine.housing.rightText" class="block__sub" data-test="right">{{ view.mine.housing.rightText }}</p>
          </section>
          <section class="block">
            <h3 class="block__title">Услуги</h3>
            <p v-if="!view.mine.services.length" class="block__sub">Нет подключённых услуг.</p>
            <div v-for="s in view.mine.services" :key="s.id" class="svc">
              <div class="svc__info">
                <p class="block__main">{{ s.title }}</p>
                <p class="block__sub">{{ s.annualText }} · {{ s.statusText }}</p>
              </div>
              <button type="button" class="btn btn--sm" :aria-label="`Отказаться: ${s.title}`" data-test="cancel" @click="cancel(s.id)">Отказаться</button>
            </div>
            <p v-for="(n, id) in notes" :key="id" class="offer__note" role="status">{{ n.text }}</p>
          </section>
          <section class="block">
            <h3 class="block__title">Посещённые сектора</h3>
            <p class="block__sub" data-test="visited-count">{{ view.mine.visitedLine }}</p>
            <p v-for="v in view.mine.visited" :key="v.id" class="block__sub"><b>{{ v.name }}</b> · {{ v.deck }} · {{ v.text }}</p>
            <p v-if="view.mine.familyTripText" class="block__sub" data-test="family-trip">{{ view.mine.familyTripText }}</p>
          </section>
          <section class="block">
            <h3 class="block__title">Имущество</h3>
            <p v-if="!view.mine.owned.length" class="block__sub">Пока ничего не приобретено.</p>
            <p v-for="o in view.mine.owned" :key="o.id" class="block__sub"><b>{{ o.title }}</b> · {{ o.text }}</p>
          </section>
        </template>

        <template v-else>
          <section class="block">
            <h3 class="block__title">Последние годы</h3>
            <p v-if="!view.history.years.length" class="block__sub">История появится после первого года самостоятельной жизни.</p>
            <table v-else class="hist">
              <thead><tr><th scope="col">Возраст</th><th scope="col">Доход</th><th scope="col">Обязательства</th><th scope="col">Фонд</th><th scope="col">Баланс</th></tr></thead>
              <tbody>
                <tr v-for="r in view.history.years" :key="r.age">
                  <th scope="row">{{ r.age }}</th><td>{{ groupDigits(r.wage + r.pension) }}</td><td>{{ groupDigits(r.bills) }}</td><td>{{ r.aid ? groupDigits(r.aid) : '—' }}</td><td>{{ groupDigits(r.balance) }}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section class="block">
            <h3 class="block__title">Операции</h3>
            <p v-if="!view.history.ledger.length" class="block__sub">Операций пока нет.</p>
            <p v-for="t in view.history.ledger" :key="t.n" class="txn"><span>{{ years(t.age) }} · {{ t.label }}</span><b>{{ t.signed }}</b></p>
          </section>
        </template>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.spend { display: grid; min-width: 0; }
.spend__head { position: sticky; top: 0; z-index: 1; display: grid; gap: 10px; padding: 14px 18px 0; background: var(--panel); border-bottom: 1px solid var(--line); }
.spend__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.spend__title { font: 600 22px/1.2 var(--font-display); min-width: 0; }
.spend__close { min-height: 40px; flex: none; }
.spend__stats { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 0; }
.spend__stats div { min-width: 0; }
.spend__stats dt { font: 500 11px/1.3 var(--font-mono); letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
.spend__stats dd { margin: 0; font: 600 16px/1.3 var(--font-mono); color: var(--text); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.spend__money { color: var(--amber); font-size: 20px !important; }
.spend__time { color: var(--cool) !important; }
.spend__basis { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--muted); overflow-wrap: anywhere; }
.spend__fc--up { color: var(--good) !important; }
.spend__fc--down { color: var(--bad) !important; }
.spend__tabs { display: flex; gap: 2px; overflow-x: auto; }
.spend__tab { flex: 1 1 auto; min-height: 44px; padding: 8px 12px; font: 500 14px/1.2 var(--font-ui); color: var(--muted); background: none; border: 0; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
.spend__tab:hover { color: var(--text); }
.spend__tab[aria-selected='true'] { color: var(--amber); border-bottom-color: var(--amber); }
.spend__tab:focus-visible, .btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.spend__body { display: grid; gap: 12px; padding: 16px 18px 20px; min-width: 0; }
.spend__hint { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--muted); }

.offer { display: grid; gap: 7px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); min-width: 0; }
.offer--off { opacity: .92; }
.offer p, .block p { margin: 0; }
.offer__head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.offer__title { font: 600 16px/1.3 var(--font-ui); }
.offer__status { flex: none; font: 500 11px/1.2 var(--font-mono); letter-spacing: .5px; text-transform: uppercase; color: var(--muted); }
.offer__status--on { color: var(--good); }
.offer__text { font-size: 13.5px; line-height: 1.5; color: var(--text-soft); }
.offer__facts { display: flex; flex-wrap: wrap; gap: 4px 16px; font: 500 13px/1.4 var(--font-mono); color: var(--amber); }
.offer__opens { font-size: 12.5px; line-height: 1.45; color: var(--muted); }
.offer__warn { padding: 5px 8px; font-size: 12.5px; line-height: 1.45; color: var(--amber); border-left: 2px solid var(--amber-2); background: var(--panel); overflow-wrap: anywhere; }
.offer__reason { font-size: 13px; line-height: 1.45; color: var(--bad); overflow-wrap: anywhere; }
.offer__hint { font-size: 13px; line-height: 1.45; color: var(--cool); overflow-wrap: anywhere; }
.offer__reason--info { color: var(--muted); }
.offer__act { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.offer__btn { min-height: 44px; padding: 8px 16px; font-size: 14px; max-width: 100%; }
.offer__cons { display: grid; gap: 3px; margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.45; color: var(--text-soft); }
.offer__goal { min-height: 40px; }
.offer__goal[aria-pressed='true'] { color: var(--amber); border-color: var(--amber-2); }
.goal { display: grid; gap: 6px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--amber-2); min-width: 0; }
.goal p { margin: 0; }
.goal__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.goal__head .btn { min-height: 40px; }
.goal__title { font: 600 15px/1.3 var(--font-ui); color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.goal__tag { margin-right: 6px; font: 500 11px/1.3 var(--font-mono); letter-spacing: .8px; text-transform: uppercase; color: var(--amber); }
.goal__line { font: 500 13px/1.45 var(--font-mono); color: var(--text-soft); overflow-wrap: anywhere; }
.goal__line--ok { color: var(--good); }
.goal__bar { height: 6px; background: var(--panel); border: 1px solid var(--line); }
.goal__bar span { display: block; height: 100%; background: var(--amber); }
.goal__cond { font-size: 13px; line-height: 1.45; color: var(--cool); overflow-wrap: anywhere; }
.goal__fine { font-size: 11.5px; line-height: 1.4; color: var(--faint); }
.offer__note { font-size: 13px; line-height: 1.45; color: var(--good); overflow-wrap: anywhere; }
.offer__note--bad { color: var(--bad); }

.rows { display: grid; gap: 1px; margin: 0; background: var(--line); border: 1px solid var(--line); }
.rows__row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px; background: var(--bg-2); }
.rows dt { color: var(--muted); font-size: 13px; }
.rows dd { margin: 0; text-align: right; font: 500 13px var(--font-mono); color: var(--text); overflow-wrap: anywhere; }

.block { display: grid; gap: 5px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); min-width: 0; }
.block__title { font: 500 11px/1.3 var(--font-mono); letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }
.block__main { font: 600 14.5px/1.4 var(--font-ui); color: var(--text); }
.block__sub { font-size: 13px; line-height: 1.5; color: var(--text-soft); overflow-wrap: anywhere; }
.svc { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
.svc .btn { min-height: 40px; flex: none; }

.hist { width: 100%; border-collapse: collapse; font: 500 12.5px var(--font-mono); font-variant-numeric: tabular-nums; }
.hist th, .hist td { padding: 6px 4px; text-align: right; border-bottom: 1px solid var(--line); }
.hist thead th { font-size: 10.5px; color: var(--muted); font-weight: 500; }
.hist tbody th { text-align: left; color: var(--muted); font-weight: 500; }
.txn { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--text-soft); }
.txn b { flex: none; font-family: var(--font-mono); color: var(--text); }

@media (max-width: 560px) {
  .spend__head { padding: 12px 12px 0; }
  .spend__body { padding: 14px 12px 18px; }
  .spend__title { font-size: 19px; }
  .spend__tab { padding: 8px 8px; font-size: 13px; }
  .offer__btn { width: 100%; }
  .hist th, .hist td { padding: 6px 2px; font-size: 11.5px; }
}
</style>
