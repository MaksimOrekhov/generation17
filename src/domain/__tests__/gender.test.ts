import { describe, expect, it } from 'vitest'
import { codeStorylets } from '../storylets'
import { codeMoments } from '../moments'
import { createGame, resolveText } from '../engine'

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => strings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out))
  return out
}

const texts = strings([codeStorylets, codeMoments])
const stripForms = (s: string) => s.replace(/\{\{\w+:[^}]*\}\}/g, 'я')

describe('род в текстах проекта', () => {
  it('формы по роду записаны верно и разворачиваются для обоих полов', () => {
    const forms = texts.filter(t => /\{\{\w+:/.test(t))
    expect(forms.length).toBeGreaterThan(50)
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = createGame(seed)
      for (const t of forms) {
        expect(t, t).toMatch(/^(?:[^{]|\{(?!\{)|\{\{\w+\}\}|\{\{\w+:[^|{}]*\|[^|{}]*\}\})*$/)
        expect(resolveText(g, t), t).not.toMatch(/\{\{\w+:/)
      }
    }
  })

  it('герой не говорит о себе в мужском роде без разметки', () => {
    const bare = /(?<![а-яё])ты\s+(?:не\s+|же\s+|тогда\s+|давно\s+|когда-то\s+|так\s+|и\s+)*[а-яё]+(?:лся|л)(?![а-яё])/i
    const allowed = new Set(['стол', 'был'])
    const bad = texts.filter(t => {
      const m = stripForms(t).match(bare)
      return m && !allowed.has(m[0].split(/\s+/).pop()!.toLowerCase())
    })
    expect(bad).toEqual([])
  })

  it('все воспоминания героя записаны без голого мужского рода', () => {
    const memoryLike = /^([А-ЯЁ][а-яё]+(?:лся|л))(?![а-яё{])/
    const nouns = new Set(['биокупол', 'зал', 'терминал', 'купол', 'сигнал', 'журнал', 'канал', 'файл', 'стол', 'протокол', 'цикл'])
    const bad = texts.filter(t => {
      const m = stripForms(t).match(memoryLike)
      return m && !nouns.has(m[1]!.toLowerCase()) && !/\{\{/.test(t)
    })
    expect(bad).toEqual([])
  })
})
