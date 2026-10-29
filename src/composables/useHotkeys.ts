import { onBeforeUnmount, onMounted } from 'vue'
import { canTakeMoment } from '../domain/engine'
import { useGameStore } from '../stores/game'

/**
 * Горячие клавиши игры. `enabled` возвращает false, пока открыто служебное окно (справка, подтверждение).
 * Пробел и Enter не перехватываются, если фокус на кнопке: у неё свой смысл.
 */
export function useHotkeys(enabled: () => boolean) {
  const store = useGameStore()

  function onKey(e: KeyboardEvent) {
    if (!enabled() || e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    const onButton = target?.tagName === 'BUTTON'

    if (store.currentEvent && !store.result && /^[1-4]$/.test(e.key)) {
      e.preventDefault()
      store.chooseVisible(Number(e.key) - 1)
      return
    }
    if (e.code === 'Space' && !onButton) {
      e.preventDefault()
      store.togglePlay()
    } else if (e.code === 'ArrowRight') {
      store.step()
    } else if (e.key === 'Enter' && !onButton) {
      if (store.result) store.continueAfterResult()
      else if (store.currentMoment && canTakeMoment(store.game)) store.acceptMoment()
    } else if (e.key === 'Escape' && store.currentMoment) {
      store.dismissMoment()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
