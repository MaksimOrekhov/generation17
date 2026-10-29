/** Small deterministic language benchmark; run with tsx, optionally node --expose-gc. */
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import { compileRequires, compileStorylet, variantText } from '../src/content/load'
import { createGame, storyBody } from '../src/domain/engine'
import type { JsonStorylet } from '../src/content/types'
import biography from '../src/content/__tests__/fixtures/biography.json'

const state = createGame(19)
state.age = 70
state.decisions = Array.from({ length: 100 }, (_, i) => ({ id: `event-${i}`, choice: 'help', age: i % 65 }))
state.decisions.push({ id: 'archive-help', choice: 'help', age: 20 })
const original = JSON.stringify(state)
const range = compileRequires({ any: [{ job: ['Техник'] }, { skill: { engineering: { min: 12 } } }], ship: { air: { min: 50 } } })
const chose = compileRequires({ chose: { 'archive-help': ['help'] }, decisionYears: { 'archive-help': { min: 30 } } })
function measure(name: string, count: number, action: () => void) {
  const samples: number[] = []
  for (let run = 0; run < 6; run++) {
    const start = performance.now(); for (let i = 0; i < count; i++) action()
    if (run) samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  const medianMs = samples[2]!
  return { name, count, medianMs: +medianMs.toFixed(3), nsPerOperation: Math.round(medianMs * 1e6 / count) }
}
const heap = process.memoryUsage().heapUsed
const catalogue = Array.from({ length: 1500 }, (_, i) => compileStorylet({ ...biography[1], id: `scale-${i}`, requires: { chose: { 'archive-help': ['help'] } } } as JsonStorylet))
const compiledHeapDeltaMb = (process.memoryUsage().heapUsed - heap) / 1024 / 1024
const prototype = catalogue[0]!
const results = [
  measure('compiled range/OR conditions', 100_000, () => { range(state) }),
  measure('chose + decisionYears, 101-record journal (worst end hit)', 100_000, () => { chose(state) }),
  measure('first-matching body variants', 100_000, () => { variantText(state, prototype.body, prototype.bodyVariants) }),
  measure('1500 events: eligibility + body + result variants', 100, () => {
    for (const s of catalogue) if (s.available(state)) {
      storyBody(state, s)
      for (const c of s.choices) variantText(state, c.result, c.resultVariants)
    }
  })
]
if (JSON.stringify(state) !== original) throw Error('benchmark mutated state or RNG')
const report = { environment: { node: process.version, platform: process.platform, arch: process.arch },
  events: catalogue.length, journalRecords: state.decisions.length, compiledHeapDeltaMb: +compiledHeapDeltaMb.toFixed(2),
  memoryNote: 'Heap delta includes normal allocation/GC noise; no per-state index or cache is retained.', results, deterministic: true }
writeFileSync('docs/audit/content-v2-performance.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
