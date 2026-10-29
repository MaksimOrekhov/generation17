import { isKnown } from './birth'
import type { GameState } from './types'
import { personByRef, STORY_PERSON_SLOTS } from './people'

/** One registry for rendering, runtime guards and JSON validation. */
export const CONTENT_PEOPLE: readonly string[] = ['parent', 'parent2', 'sibling', 'friend', 'neighbor', 'mentor', 'child', 'partner', 'formerPartner', ...STORY_PERSON_SLOTS]
export function mentionedPeople(text: string): string[] {
  return CONTENT_PEOPLE.filter(id => text.includes(`{{${id}}}`) || text.includes(`{{${id}:`))
}
export function safePeople(g: GameState, text: string, historical: readonly string[] = []): boolean {
  return mentionedPeople(text).every(id => isKnown(g, id) || historical.includes(id) && !!personByRef(g, id) && personByRef(g, id)!.since <= g.age)
}
