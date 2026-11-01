export const LIFE_TARGETS = {
  family: 'life-family',
  forks: 'life-forks',
  ship: 'life-ship',
  memory: 'life-memory'
} as const

export type LifeTargetId = typeof LIFE_TARGETS[keyof typeof LIFE_TARGETS]

interface JumpDoc {
  getElementById(id: string): HTMLElement | null
  querySelector?(selector: string): Element | null
}

/** Явный переход игрока к существующей панели: без цели или при блокирующем окне ничего не делает. */
export function jumpToLifeTarget(id: LifeTargetId, opts: { blocked: boolean; doc?: JumpDoc }): boolean {
  if (opts.blocked) return false
  const doc = opts.doc ?? (typeof document === 'undefined' ? null : document)
  const target = doc?.getElementById(id)
  if (!target) return false
  target.scrollIntoView({ behavior: 'auto', block: 'start' })
  // липкая шапка может быть выше запаса scroll-margin (переносится при узком окне): доводим по факту
  const bar = doc?.querySelector?.('.top')
  if (bar && typeof window !== 'undefined') {
    const hidden = bar.getBoundingClientRect().bottom + 8 - target.getBoundingClientRect().top
    if (hidden > 0) window.scrollBy(0, -hidden)
  }
  target.focus({ preventScroll: true })
  return true
}
