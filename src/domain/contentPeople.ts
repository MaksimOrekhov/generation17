import { isKnown } from './birth'
import type { GameState } from './types'

/** One registry for rendering, runtime guards and JSON validation. */
export const CONTENT_PEOPLE = ['parent', 'parent2', 'sibling', 'friend', 'neighbor', 'mentor', 'child'] as const
export function mentionedPeople(text: string): string[] {
  return CONTENT_PEOPLE.filter(id => text.includes(`{{${id}}}`) || text.includes(`{{${id}:`))
}
export function safePeople(g: GameState, text: string, historical: readonly string[] = []): boolean {
  return mentionedPeople(text).every(id => isKnown(g, id) || historical.includes(id) && g.people.some(p => p.id === id && p.since <= g.age))
}
