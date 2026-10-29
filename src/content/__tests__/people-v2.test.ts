import { describe, expect, it } from 'vitest'
import items from '../../../content/storylets/people-v2.json'
import { collectKnown, validateContent } from '../validate'
import { codeStorylets } from '../../domain/storylets'
import { codeMoments } from '../../domain/moments'

const errors = (data: unknown) => validateContent([{ path: 'people.json', kind: 'storylets', data }], collectKnown(codeStorylets, codeMoments)).filter(i => i.level === 'error')

describe('people content validation', () => {
  it('accepts the shipped people stories', () => expect(errors(items)).toEqual([]))
  it.each([
    { person: { acquaintance: { availability: 'ghost' } } },
    { person: { acquaintance: { sectorId: 'missing' } } },
    { person: { acquaintance: { alive: true } } },
    { addPerson: { slot: 'unregistered', role: 'friend' } },
    { relationship: { action: 'start', person: 'unregistered' } }
  ])('rejects unsafe effect %j', effect => {
    const copy = structuredClone(items)
    copy[0]!.choices[0]!.effects = effect as never
    expect(errors(copy).length).toBeGreaterThan(0)
  })
})
