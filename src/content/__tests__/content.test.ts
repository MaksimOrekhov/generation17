import { describe, expect, it } from 'vitest'
import bundle from '../bundle.json'
import { compileRequires, compileStorylet } from '../load'
import { collectKnown, validateContent, type ContentFile } from '../validate'
import { codeMoments, contentMoments } from '../../domain/moments'
import { codeStorylets, contentStorylets } from '../../domain/storylets'
import { createGame } from '../../domain/engine'
import { gYearPlaceholder } from '../../domain/constants'
import type { JsonStorylet } from '../types'

const known = collectKnown(codeStorylets, codeMoments)

function load(kind: 'storylets' | 'moments') {
  const modules = import.meta.glob('../../../content/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
  return Object.entries(modules)
    .filter(([path]) => path.includes(`/content/${kind}/`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, data]): ContentFile => ({ path, kind, data }))
}

const sample = (): JsonStorylet => structuredClone(bundle.storylets.find(s => s.id === 'tin-whistle')!) as JsonStorylet
const validate = (items: unknown[]) => validateContent([{ path: 't.json', kind: 'storylets', data: items }], known)
const errors = (items: unknown[]) => validate(items).filter(i => i.level === 'error').map(i => i.where + ' ' + i.message).join('\n')

describe('content/', () => {
  const files = [...load('storylets'), ...load('moments')]

  it('проходит валидацию без ошибок', () => {
    const issues = validateContent(files, known).filter(i => i.level === 'error')
    expect(issues).toEqual([])
  })

  it('bundle.json совпадает с файлами (npm run content)', () => {
    const pack = (kind: string) => files.filter(f => f.kind === kind).flatMap(f => f.data as unknown[])
    expect(bundle).toEqual({ storylets: pack('storylets'), moments: pack('moments') })
  })

  it('попадает в каталоги игры', () => {
    expect(contentStorylets.length).toBe(bundle.storylets.length)
    expect(contentMoments.length).toBe(bundle.moments.length)
  })
})

describe('валидатор', () => {
  it('принимает образец', () => expect(errors([sample()])).toBe(''))

  it('ловит неизвестные поля, стат, подстановку, флаг и категорию', () => {
    const s = sample()
    Object.assign(s, { extra: 1, category: 'Выдумка' })
    s.body += ' {{stranger}}'
    s.choices[0].effects = { stats: { luck: 3 } } as never
    s.requires = { flag: ['neverSetFlag'] }
    const out = errors([s])
    for (const part of ['extra', 'Выдумка', 'stranger', 'luck', 'neverSetFlag']) expect(out).toContain(part)
  })

  it('не пускает человека, которого нет в body', () => {
    const s = sample()
    s.body = s.body.replace('{{neighbor}}', 'сосед')
    expect(errors([s])).toContain('не гарантирован')
  })

  it('ловит дубли id и занятые кодом id', () => {
    expect(errors([sample(), sample()])).toContain('id уже занят')
    const s = sample()
    s.id = codeStorylets[0].id
    expect(errors([s])).toContain('кодом проекта')
  })

  it('ограничивает величину эффектов и число выборов', () => {
    const s = sample()
    s.choices[0].effects = { stats: { morale: 40 } }
    s.choices = s.choices.slice(0, 1)
    const out = errors([s])
    expect(out).toContain('нужно 2–4 выбора')
    s.choices = [sample().choices[0], sample().choices[1]]
    s.choices[0].effects = { stats: { morale: 40 } }
    expect(errors([s])).toContain('больше допустимого')
  })
})

describe('requires', () => {
  const g = () => {
    const state = createGame(1)
    state.age = 20
    return state
  }

  it('флаги и возраст', () => {
    const state = g()
    state.flags = { a: 'x', born: 12 }
    expect(compileRequires({ flag: ['a'], flagNot: ['b'] })(state)).toBe(true)
    expect(compileRequires({ flagNot: ['a'] })(state)).toBe(false)
    expect(compileRequires({ flagIs: { a: ['x', 'y'] } })(state)).toBe(true)
    expect(compileRequires({ flagIs: { a: 'z' } })(state)).toBe(false)
    expect(compileRequires({ since: { born: 8 } })(state)).toBe(true)
    expect(compileRequires({ since: { born: 9 } })(state)).toBe(false)
    expect(compileRequires({ since: { missing: 1 } })(state)).toBe(false)
  })

  it('профессия, люди и показатели', () => {
    const state = g()
    state.protagonist.job = 'Медик'
    state.stats.stress = 50
    expect(compileRequires({ job: ['Медик', 'Техник'] })(state)).toBe(true)
    expect(compileRequires({ job: ['Агроном'] })(state)).toBe(false)
    expect(compileRequires({ stat: { stress: { min: 40, max: 60 } } })(state)).toBe(true)
    expect(compileRequires({ stat: { stress: { max: 40 } } })(state)).toBe(false)
    state.people.find(p => p.id === 'parent')!.alive = false
    expect(compileRequires({ alive: ['parent'] })(state)).toBe(false)
  })

  it('"@age" превращается в возраст героя', () => {
    const compiled = compileStorylet(sample())
    expect(compiled.choices[0].effects.flags?.tinWhistleAge).toBe(gYearPlaceholder)
  })
})
