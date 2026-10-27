import type { Focus } from './types'

export const FOCUS_ORDER: Focus[] = ['study', 'relationships', 'work', 'rest', 'civic']
export const FOCUS_UNLOCK: Record<Focus, number> = { study: 6, relationships: 6, rest: 6, work: 14, civic: 14 }
/** До этого возраста за героя решают взрослые: фокус года недоступен. */
export const FOCUS_FROM_AGE = 6

export const allowedFocuses = (age: number) => FOCUS_ORDER.filter(f => age >= FOCUS_UNLOCK[f])
export const canFocus = (age: number, focus: Focus) => age >= FOCUS_UNLOCK[focus]
