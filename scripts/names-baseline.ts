import { writeFileSync } from 'node:fs'
import { createGame } from '../src/domain/engine'
import { createStoryPerson } from '../src/domain/people'
import type { GameState, Gender, Peer, Person } from '../src/domain/types'

const DEFAULT_SAMPLES = 5_000
const DEFAULT_REPEATABILITY_SAMPLES = 100
const STORY_PERSON_SAMPLES = 100
const REPORT_PATH = 'docs/audit/names-baseline-5000.md'

interface NameRecord {
  seed: number
  id: string
  role: string
  gender: Gender | null
  name: string
  kind: 'Person' | 'Peer'
  family: boolean
}

interface CollisionSummary {
  games: number
  eligiblePairs: number
  firstNamePairs: number
  fullNamePairs: number
}

function parseCount(args: string[], flag: string, fallback: number): number {
  const index = args.indexOf(flag)
  if (index < 0) return fallback
  const value = Number(args[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${flag} requires a positive integer`)
  return value
}

function actorsFor(seed: number, game: GameState): NameRecord[] {
  const familyIds = new Set(['protagonist', 'parent', 'parent2', 'sibling'])
  const people: NameRecord[] = [
    { seed, id: 'protagonist', role: 'Главный герой', gender: game.protagonist.gender ?? null, name: game.protagonist.name, kind: 'Person', family: true },
    ...game.people.map((person: Person) => ({
      seed, id: person.id, role: person.role, gender: person.gender ?? null, name: person.name,
      kind: 'Person' as const, family: familyIds.has(person.id)
    })),
    ...game.peers.map((peer: Peer) => ({
      seed, id: peer.id, role: 'Peer', gender: null, name: peer.name,
      kind: 'Peer' as const, family: false
    }))
  ]
  return people
}

function normalizedName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function givenName(name: string) {
  return normalizedName(name).split(' ')[0]!
}

function collisionSummary(groups: Map<number, NameRecord[]>, familyFree: boolean): CollisionSummary {
  let eligiblePairs = 0
  let firstNamePairs = 0
  let fullNamePairs = 0
  for (const records of groups.values()) {
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const left = records[i]!
        const right = records[j]!
        if (left.id === right.id) continue
        if (familyFree && left.family && right.family) continue
        eligiblePairs++
        if (givenName(left.name) === givenName(right.name)) firstNamePairs++
        if (normalizedName(left.name) === normalizedName(right.name)) fullNamePairs++
      }
    }
  }
  return { games: groups.size, eligiblePairs, firstNamePairs, fullNamePairs }
}

function tally(records: NameRecord[], field: (record: NameRecord) => string) {
  const counts = new Map<string, number>()
  for (const record of records) counts.set(field(record), (counts.get(field(record)) ?? 0) + 1)
  return counts
}

function topRepeated(counts: Map<string, number>, limit = 5) {
  return [...counts.entries()].filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))
    .slice(0, limit)
}

function escapeCell(value: string) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeCell).join(' | ')} |`)
  ].join('\n')
}

function verifyRepeatability(sampleCount: number) {
  for (let seed = 1; seed <= sampleCount; seed++) {
    const first = createGame(seed)
    const second = createGame(seed)
    if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error(`createGame(${seed}) was not repeatable`)
  }
  return sampleCount
}

function verifyStoryPerson(seedCount: number) {
  for (let seed = 1; seed <= seedCount; seed++) {
    const game = createGame(seed)
    const beforeRng = game.rng
    const beforePeople = JSON.stringify(game.people)
    const first = createStoryPerson(game, 'acquaintance', 'friend')
    const afterRng = game.rng
    const second = createStoryPerson(game, 'acquaintance', 'friend')
    if (first.id !== 'story-acquaintance' || first.id !== second.id || beforePeople === JSON.stringify(game.people)) {
      throw new Error(`createStoryPerson invariant failed for seed ${seed}`)
    }
    if (beforeRng !== afterRng || afterRng !== game.rng) throw new Error(`createStoryPerson changed RNG or was not idempotent for seed ${seed}`)
  }
  return seedCount
}

function report(samples: number, repeatabilitySamples: number) {
  const records: NameRecord[] = []
  const groups = new Map<number, NameRecord[]>()
  const roleRecords = new Map<string, NameRecord[]>()
  const firstThousandHeroNames = new Set<string>()

  for (let seed = 1; seed <= samples; seed++) {
    const game = createGame(seed)
    const actors = actorsFor(seed, game)
    groups.set(seed, actors)
    if (seed <= 1_000) firstThousandHeroNames.add(normalizedName(game.protagonist.name))
    for (const actor of actors) {
      records.push(actor)
      const role = roleRecords.get(actor.role) ?? []
      role.push(actor)
      roleRecords.set(actor.role, role)
    }
    if (seed <= STORY_PERSON_SAMPLES) {
      const auditCopy = structuredClone(game)
      const sourceBefore = JSON.stringify(game)
      const storyPerson = createStoryPerson(auditCopy, 'acquaintance', 'friend')
      if (JSON.stringify(game) !== sourceBefore) throw new Error('createStoryPerson changed the source createGame state')
      const record: NameRecord = {
        seed, id: storyPerson.id, role: `Сюжетный слот: ${storyPerson.role}`,
        gender: storyPerson.gender ?? null, name: storyPerson.name, kind: 'Person', family: false
      }
      const role = roleRecords.get(record.role) ?? []
      role.push(record)
      roleRecords.set(record.role, role)
    }
  }

  const roleRows = [...roleRecords.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru')).map(([role, rows]) => {
    const given = new Set(rows.map(record => givenName(record.name)))
    const full = new Set(rows.map(record => normalizedName(record.name)))
    const withGender = rows.filter(record => record.gender !== null).length
    return [role, String(rows.length), String(given.size), String(full.size), `${withGender}/${rows.length}`]
  })

  const fullRepeatRows = [...roleRecords.entries()].flatMap(([role, rows]) =>
    topRepeated(tally(rows, record => normalizedName(record.name))).map(([name, count]) => [role, name, String(count)])
  )
  const givenRepeatRows = [...roleRecords.entries()].flatMap(([role, rows]) =>
    topRepeated(tally(rows, record => givenName(record.name))).map(([name, count]) => [role, name, String(count)])
  )

  const allCollisions = collisionSummary(groups, false)
  const nonFamilyCollisions = collisionSummary(groups, true)
  const peerRecords = records.filter(record => record.kind === 'Peer')
  const personRecords = records.filter(record => record.kind === 'Person')

  const result = [
    `# Аудит имён на ${samples.toLocaleString('ru-RU')} seed`,
    '',
    `База production-кода: \`e537eed59c4e52b053db9058301f2f374b306d3c\`. Seed: \`1..${samples}\`, атмосфера \`mystery\`.`,
    '',
    '## Метод',
    '',
    `Для каждого seed вызван реальный \`createGame(seed)\`; анализируется только стартовое состояние игры. Выборка содержит ${samples} seed. Отдельная проверка повторно вызвала \`createGame(seed)\` для seed 1..${repeatabilitySamples} и сравнила полные сериализованные состояния.`,
    '',
    'Снимок включает героя (`protagonist`), `Person` из `game.people` (родители, sibling при наличии, друг, сосед, наставник), пять отдельных `Peer` и сохраняет для каждого `id`, `role`, значение `name` и явно заданный `gender`. У друга, соседа, наставника и `Peer` значение `name` однословное; пол для `Peer` оставлен неизвестным, так как у типа `Peer` нет поля пола. Культурная принадлежность не выводится.',
    '',
    `Дополнительно на seed 1..${Math.min(samples, STORY_PERSON_SAMPLES)} клонировано начальное состояние, затем вызван \`createStoryPerson(copy, 'acquaintance', 'friend')\`. Сюжетные записи исключены из метрик \`createGame()\`; проверено, что повторный вызов для слота идемпотентен и общий RNG не меняется.`,
    '',
    'Сравнение считает пары с уникальными ID внутри одной жизни. «Полные совпадения» — нормализованное значение всего поля `name`; «совпадения первых имён» — первый компонент до пробела. У однословных имён эти значения совпадают. В метрике «не внутри семьи» исключены только пары, где оба участника — герой, родитель или sibling; семейное наследование фамилии не трактуется как коллизия. Для всех метрик знаменатель — число допустимых пар actor-ID по всем seed.',
    '',
    '## Разнообразие по роли',
    '',
    markdownTable(['Роль', 'Записей', 'Разных первых имён', 'Разных значений `name`', 'Явный пол'], roleRows),
    '',
    `В этой выборке ${personRecords.length} записей типа \`Person\` и ${peerRecords.length} записей типа \`Peer\`; у ${groups.size} игровых жизней присутствуют ровно ${Math.min(5, peerRecords.length / Math.max(groups.size, 1))} Peer.`,
    '',
    '## Частые повторы между seed',
    '',
    'В каждой роли показаны до пяти самых частых повторяющихся полных имён; счётчик — количество записей в объединённой выборке.',
    '',
    markdownTable(['Роль', 'Значение поля name', 'Встречено'], fullRepeatRows),
    '',
    'До пяти самых частых первых имён по каждой роли:',
    '',
    markdownTable(['Роль', 'Первое имя', 'Встречено'], givenRepeatRows),
    '',
    '## Совпадения внутри одной жизни',
    '',
    markdownTable(['Набор пар', 'Игровых жизней', 'Допустимых пар', 'Совпадений первых имён', 'Совпадений полных имён'], [
      ['Все участники', String(allCollisions.games), String(allCollisions.eligiblePairs), String(allCollisions.firstNamePairs), String(allCollisions.fullNamePairs)],
      ['Хотя бы один участник вне семьи', String(nonFamilyCollisions.games), String(nonFamilyCollisions.eligiblePairs), String(nonFamilyCollisions.firstNamePairs), String(nonFamilyCollisions.fullNamePairs)]
    ]),
    '',
    '## Повторяемость и воспроизведение',
    '',
    `Результат: \`createGame(seed)\` совпал полностью при повторном вызове на ${repeatabilitySamples}/${repeatabilitySamples} контрольных seed. Проверка не сохраняет состояние игры и не вызывает игровые переходы.`,
    '',
    'Команда воспроизведения из корня репозитория:',
    '',
    '```sh',
    'npm exec tsx -- scripts/names-baseline.ts',
    '```',
    '',
    `Опционально: \`npm exec tsx -- scripts/names-baseline.ts --samples ${samples} --check-samples ${repeatabilitySamples}\`. Количество seed задаёт непрерывный список от 1 до N; скрытого RNG или случайной выборки нет. Команда перезаписывает этот отчёт.`,
    '',
    '## Сопоставление с GEN-44',
    '',
    `Для героя на seed 1..1000 реальный \`createGame()\` дал ${firstThousandHeroNames.size} различных значений \`name\` из 224 возможных (16 первых имён × 14 фамилий), то есть ${1_000 - firstThousandHeroNames.size} вхождений сверх первого экземпляра каждого имени. В GEN-44 зеркальная реализация дала 222 различных значения и 778 повторных вхождений; агрегат ${firstThousandHeroNames.size === 222 ? 'совпал' : 'отличается'} с ней на этом наборе. Прежняя цифра остаётся зеркальным расчётом, не контрольным эталоном полного состояния игры.`,
    '',
    '## Ограничения',
    '',
    '- Исследуется только стартовое состояние, без продвижения времени, отношений, смертей и последующих сюжетных персонажей.',
    '- Наблюдения ограничены внутренними синтетическими пулами текущей игры и не оценивают лингвистическую достоверность, культурное покрытие или качество будущего генератора.',
    '- `createStoryPerson()` исследуется отдельно на фиксированном слоте/роли и не смешивается с населением `createGame()`.',
    '- Результаты описывают конечный фиксированный набор seed; это описательная перепись, не статистическая оценка реального населения.',
    ''
  ].join('\n')

  writeFileSync(REPORT_PATH, result)
  process.stdout.write(`Wrote ${REPORT_PATH} (${samples} seeds; ${records.length} createGame actors; ${allCollisions.fullNamePairs} full-name collision pairs)\n`)
}

const args = process.argv.slice(2)
const samples = parseCount(args, '--samples', DEFAULT_SAMPLES)
const repeatabilitySamples = Math.min(parseCount(args, '--check-samples', DEFAULT_REPEATABILITY_SAMPLES), samples)
const repeatabilityChecks = verifyRepeatability(repeatabilitySamples)
verifyStoryPerson(Math.min(samples, STORY_PERSON_SAMPLES))
report(samples, repeatabilityChecks)
