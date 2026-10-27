import { onBeforeUnmount, onMounted } from 'vue'
import { useGameStore } from '../stores/game'

/** Единственный источник времени: один requestAnimationFrame на всё приложение, дальше работает домен. */
export function useGameLoop() {
  const store = useGameStore()
  let raf = 0
  let last = 0

  const loop = (now: number) => {
    store.frame((now - last) / 1000)
    last = now
    raf = requestAnimationFrame(loop)
  }

  onMounted(() => {
    last = performance.now()
    raf = requestAnimationFrame(loop)
  })
  onBeforeUnmount(() => cancelAnimationFrame(raf))
}
