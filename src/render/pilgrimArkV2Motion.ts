export interface MotionScheduler {
  request(callback: (timestamp: number) => void): number
  cancel(id: number): void
}

export interface PilgrimPreviewMotion {
  draw(seconds: number, animated: boolean): void
}

/** Local to the standalone artwork preview; never attached to the game scene or clock. */
export function createPilgrimPreviewMotion(preview: PilgrimPreviewMotion, scheduler: MotionScheduler, prefersReducedMotion = false) {
  let reduced = prefersReducedMotion
  let enabled = !reduced
  let hidden = false
  let elapsed = 0
  let previous: number | null = null
  let pending: number | null = null

  const stop = () => {
    if (pending !== null) scheduler.cancel(pending)
    pending = null
    previous = null
  }

  const frame = (timestamp: number) => {
    pending = null
    if (hidden || !enabled || reduced) return
    if (previous !== null) elapsed += Math.max(0, timestamp - previous) / 1000
    previous = timestamp
    preview.draw(elapsed, true)
    pending = scheduler.request(frame)
  }

  const start = () => {
    stop()
    if (hidden || !enabled || reduced) {
      preview.draw(0, false)
      return
    }
    pending = scheduler.request(frame)
  }

  preview.draw(0, false)
  if (enabled) pending = scheduler.request(frame)

  return {
    get enabled() { return enabled && !reduced },
    get reduced() { return reduced },
    setEnabled(next: boolean) {
      enabled = next && !reduced
      start()
    },
    setReducedMotion(next: boolean) {
      reduced = next
      if (reduced) enabled = false
      start()
    },
    setHidden(next: boolean) {
      hidden = next
      if (hidden) stop()
      else start()
    },
    dispose: stop
  }
}
