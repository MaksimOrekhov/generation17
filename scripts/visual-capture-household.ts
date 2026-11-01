/**
 * GEN-101: сравнительные скриншоты «Живой дом» из реального GameScreen (не DEV-fixture и не UI-макет).
 *
 *   npm run visual:capture:household           → artifacts/visual-capture-household/
 *   OUT_DIR=путь npm run visual:capture:household
 *
 * Шесть исходных кадров GEN-100 (`npm run visual:capture`) этим скриптом не меняются.
 * Взрослая жизнь строится движком (createGame → advanceYear/decide), а состояние «подтверждённый партнёр
 * и общий дом» задаётся теми же доменными функциями, что и сюжет (beginRelationship, endRelationship,
 * поля Person.state), и записывается обычным сохранением. Рисует уже готовое приложение: guard
 * `householdLook` не подменяется. Дополнительно проверяется, что Canvas после потери/раздельного
 * проживания/distant побайтово равен обычной каюте, а кадр shared отличается только областью второй кружки.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Browser, ConsoleMessage } from 'playwright'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { DEFAULT_PRESET } from '../src/domain/clock'
import { residenceOf } from '../src/domain/birth'
import { advanceYear, canChoose, createGame, decide } from '../src/domain/engine'
import { beginRelationship, endRelationship } from '../src/domain/people'
import type { GameState, SectorId } from '../src/domain/types'
import { householdLook } from '../src/render/household'
import { SCENE_H, SCENE_W, resolveScene } from '../src/render/scene'

const SEED = 17017
const ADULT_AGE = 24
const VIEWPORT = { width: 1440, height: 900 }
const STORAGE_KEY = 'generation17-v2'
const TIMEOUT_MS = 30_000
const ROOT = process.cwd()
const OUT_DIR = resolve(ROOT, process.env.OUT_DIR ?? 'artifacts/visual-capture-household')
const REPRODUCE = 'npm ci && npx playwright install chromium && npm run visual:capture:household'
/** Область второй кружки на Canvas 480×270 (с полями); вне неё кадры ordinary и shared совпадают. */
const MUG_AREA = { x: 390, y: 174, w: 24, h: 20 }

class CaptureError extends Error {}
function fail(message: string): never {
  throw new CaptureError(message)
}

function lifeAtAge(seed: number, age: number): GameState {
  let game = createGame(seed)
  for (let guard = 0; (game.age < age || game.pending) && !game.stopped; guard++) {
    if (guard > 500) fail(`Не удалось довести seed ${seed} до возраста ${age}`)
    if (game.pending) {
      const index = [0, 1, 2, 3, 4, 5].find(i => canChoose(game, i).available)
      if (index === undefined) fail(`seed ${seed}: нет доступного выбора в решении «${game.pending}»`)
      game = decide(game, index)
    } else {
      game = advanceYear(game)
    }
  }
  if (game.stopped || game.age !== age || game.pending) fail(`seed ${seed}: возраст ${age} не достигнут штатной жизнью`)
  return game
}

const otherSector = (home: SectorId): SectorId => home === 'lower' ? 'bio' : 'lower'

/** Жизнь без общего дома; подготовка дальше клонирует её, чтобы кадры отличались только проверяемым фактом. */
function baseLife(): GameState {
  const game = structuredClone(lifeAtAge(SEED, ADULT_AGE))
  game.moment = null
  game.relationships = { partnerId: null, formerPartnerIds: [] }
  game.flags.livingTogether = false
  const home = residenceOf(game)
  // Настоящий «друг детства» из рождения жизни; меняется только его проживание.
  const friend = game.people.find(p => p.id === 'friend')
  if (!friend || !friend.alive || friend.since > game.age) fail('в жизни seed нет живого friend')
  friend.state = { ...friend.state, sectorId: otherSector(home), availability: 'available' }
  return game
}

function sharedLife(): GameState {
  const game = baseLife()
  const friend = game.people.find(p => p.id === 'friend')!
  friend.state = { ...friend.state, sectorId: residenceOf(game) }
  if (!beginRelationship(game, 'friend')) fail('beginRelationship отклонил партнёра')
  game.flags.livingTogether = true
  return game
}

const FRAMES = [
  { id: 'adult-ordinary', expected: 'ordinary', note: 'взрослый, idle home, без партнёра', build: baseLife },
  { id: 'adult-shared', expected: 'shared', note: 'взрослый, подтверждённый партнёр + общий дом, тот же сектор', build: sharedLife },
  { id: 'after-loss', expected: 'ordinary', note: 'после разрыва (endRelationship)', build: () => { const g = sharedLife(); endRelationship(g); return g } },
  { id: 'after-apart', expected: 'ordinary', note: 'раздельное проживание: сектор партнёра ≠ дом, livingTogether=false', build: () => { const g = sharedLife(); g.people.find(p => p.id === 'friend')!.state!.sectorId = otherSector(residenceOf(g)); g.flags.livingTogether = false; return g } },
  { id: 'after-distant', expected: 'ordinary', note: 'партнёр distant', build: () => { const g = sharedLife(); g.people.find(p => p.id === 'friend')!.state!.availability = 'distant'; return g } }
] as const

const frameFile = (index: number, id: string) => `${String(index + 1).padStart(2, '0')}-${id}.png`

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

async function main() {
  const rel = relative(ROOT, OUT_DIR)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail(`OUT_DIR ${OUT_DIR} должен быть подкаталогом репозитория`)
  const expectedCommit = process.env.CAPTURE_SHA
  const headCommit = git('rev-parse', 'HEAD')
  if (expectedCommit && headCommit !== expectedCommit) fail(`checkout HEAD ${headCommit || 'неизвестен'} ≠ ожидаемый CAPTURE_SHA ${expectedCommit}`)
  const commit = headCommit || 'unknown'
  const dirty = git('status', '--porcelain') !== ''
  mkdirSync(OUT_DIR, { recursive: true })
  for (const name of ['manifest.json', 'manifest.md', ...FRAMES.map((f, i) => frameFile(i, f.id))]) rmSync(join(OUT_DIR, name), { force: true })

  const { chromium } = await import('playwright')
  let browser: Browser | null = null
  let server: ViteDevServer | null = null
  const frames: Array<Record<string, unknown> & { id: string; canvasPixels: number[] }> = []
  try {
    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      fail(`Не удалось запустить Chromium (${(error as Error).message.split('\n')[0]}). Выполните: npx playwright install chromium`)
    }
    server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') fail('Vite dev-сервер не вернул порт')
    const origin = `http://127.0.0.1:${address.port}`

    for (const [index, frame] of FRAMES.entries()) {
      const game = frame.build()
      const homeScene = resolveScene({
        started: true, momentId: null, momentSpot: null, pendingStorylet: false, hasDecision: false,
        resultVisible: false, stopped: false, shopOpen: false, residenceSectorId: residenceOf(game)
      })
      const look = householdLook(game, homeScene)
      if (look !== frame.expected) fail(`[${frame.id}] householdLook=${look}, ожидалось ${frame.expected}`)
      const save = JSON.stringify({ game, started: false, preset: DEFAULT_PRESET })
      const problems: string[] = []
      const where = `[${frame.id}]`
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' })
      context.setDefaultTimeout(TIMEOUT_MS)
      await context.addInitScript(([key, value]) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
      }, [STORAGE_KEY, save] as const)
      const page = await context.newPage()
      page.on('pageerror', error => problems.push(`pageerror: ${error.message}`))
      page.on('console', (message: ConsoleMessage) => {
        if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
      })
      try {
        await page.goto(`${origin}/`, { waitUntil: 'load' })
        const begin = page.getByRole('button', { name: /Начать жизнь/ })
        await begin.waitFor().catch(() => fail(`${where} экран рождения не появился`))
        await begin.click()
        await page.locator('.game__col--center [data-test="scene-canvas"]').waitFor().catch(() => fail(`${where} GameScreen не открылся`))
        await page.getByRole('button', { name: /Пауза/ }).first().click().catch(() => fail(`${where} кнопка «Пауза» недоступна`))
        await page.getByRole('button', { name: /Играть/ }).first().waitFor().catch(() => fail(`${where} время не встало на паузу`))
        const gotIt = page.getByRole('button', { name: 'Понятно' })
        if (await gotIt.count()) await gotIt.first().click()
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

        const seen = await page.evaluate(({ area }) => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-test="scene-canvas"]')!
          const ctx = canvas.getContext('2d')!
          const tags = [...document.querySelectorAll('.scene__hud .scene__tag')].filter(el => !el.classList.contains('scene__attn'))
          const rect = canvas.getBoundingClientRect()
          return {
            backing: [canvas.width, canvas.height],
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            ariaLabel: canvas.getAttribute('aria-label'),
            tags: tags.map(el => el.textContent?.trim() ?? ''),
            popup: !!document.querySelector('[role="alertdialog"]'),
            pixels: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data],
            mug: [...ctx.getImageData(area.x, area.y, area.w, area.h).data],
            stored: (() => { const s = JSON.parse(localStorage.getItem('generation17-v2') ?? '{}').game; return { seed: s?.seed, age: s?.age, partner: s?.relationships?.partnerId ?? null, together: s?.flags?.livingTogether ?? null } })()
          }
        }, { area: MUG_AREA })

        if (seen.backing[0] !== SCENE_W || seen.backing[1] !== SCENE_H) problems.push(`backing ${seen.backing.join('×')}`)
        if (seen.popup) problems.push('поверх сцены показан момент (не idle)')
        if (seen.tags.length !== 1 || seen.tags[0] !== homeScene.label) problems.push(`подпись места ${JSON.stringify(seen.tags)} ≠ «${homeScene.label}»`)
        if (seen.ariaLabel !== homeScene.ariaLabel) problems.push(`aria-label «${seen.ariaLabel}» ≠ «${homeScene.ariaLabel}» (не должно быть фраз о партнёре)`)
        if (seen.stored.seed !== SEED || seen.stored.age !== ADULT_AGE) problems.push(`сохранение seed/age ${seen.stored.seed}/${seen.stored.age}`)
        if (/партн[её]р/i.test(`${seen.ariaLabel} ${seen.tags.join(' ')}`)) problems.push('HUD/aria упоминает партнёра')
        const png = await page.screenshot({ type: 'png', animations: 'disabled' })
        if (problems.length) fail(`${where} ${problems.join('; ')}`)
        const file = frameFile(index, frame.id)
        writeFileSync(join(OUT_DIR, file), png)
        const canvasSha256 = createHash('sha256').update(Buffer.from(seen.pixels)).digest('hex')
        const mugSha256 = createHash('sha256').update(Buffer.from(seen.mug)).digest('hex')
        frames.push({
          id: frame.id, canvasPixels: seen.pixels, order: index + 1, file, note: frame.note, householdLook: look,
          sha256: createHash('sha256').update(png).digest('hex'), canvasSha256, mugAreaSha256: mugSha256,
          placeLabel: homeScene.label, canvasAriaLabel: homeScene.ariaLabel, canvasRect: seen.rect,
          relationships: { partnerId: seen.stored.partner, livingTogether: seen.stored.together }, checks: 'passed'
        })
        console.log(`✓ ${file}  ${frame.id} → ${look}`)
      } finally {
        await context.close()
      }
    }
  } finally {
    try { await browser?.close() } catch (error) { console.error(`cleanup: ${(error as Error).message}`); process.exitCode = 1 }
    try { await server?.close() } catch (error) { console.error(`cleanup: ${(error as Error).message}`); process.exitCode = 1 }
  }

  // Доказательные сравнения по пикселям Canvas (до сжатия в PNG страницы).
  const byId = new Map(frames.map(f => [f.id, f]))
  const ordinary = byId.get('adult-ordinary')!
  const shared = byId.get('adult-shared')!
  if (ordinary.canvasSha256 === shared.canvasSha256) fail('Canvas ordinary и shared совпадают: вторая кружка не видна')
  const a = ordinary.canvasPixels
  const b = shared.canvasPixels
  const outside: number[] = []
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue
    const x = (i / 4) % SCENE_W
    const y = Math.floor(i / 4 / SCENE_W)
    if (x < MUG_AREA.x || x >= MUG_AREA.x + MUG_AREA.w || y < MUG_AREA.y || y >= MUG_AREA.y + MUG_AREA.h) outside.push(i / 4)
  }
  if (outside.length) fail(`shared отличается от ordinary вне области кружки: ${outside.length} px`)
  for (const id of ['after-loss', 'after-apart', 'after-distant']) {
    if (byId.get(id)!.canvasSha256 !== ordinary.canvasSha256) fail(`Canvas ${id} не совпал с обычной каютой: остался след shared`)
  }

  const publicFrames = frames.map(({ canvasPixels: _pixels, ...rest }) => rest)
  const manifest = {
    evidenceType: 'REAL GAMESCREEN • VALID GAMESTATE SAVE (не DEV-fixture, не UI-макет)',
    commit, workingTreeDirty: dirty, generatedAt: new Date().toISOString(), command: REPRODUCE,
    seed: SEED, lifeAge: ADULT_AGE, viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce',
    browser: 'Chromium (Playwright, headless)',
    stateConstruction: 'createGame/advanceYear/decide до возраста 24; партнёр и общий дом заданы beginRelationship/endRelationship и полями Person.state, затем записаны обычным сохранением до загрузки приложения; guard householdLook не подменялся',
    comparisons: {
      sharedVsOrdinary: `различия пикселей Canvas только в области x${MUG_AREA.x}..${MUG_AREA.x + MUG_AREA.w - 1}, y${MUG_AREA.y}..${MUG_AREA.y + MUG_AREA.h - 1}`,
      fallbackFrames: 'Canvas after-loss, after-apart и after-distant побайтово равны adult-ordinary'
    },
    frames: publicFrames,
    limitations: [
      'Статичный кадр при reduced motion; движение, UX и непрерывность геймплея не доказываются.',
      'Не является художественным одобрением (ART PASS): читаемость двух кружек оценивает ART.'
    ]
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(join(OUT_DIR, 'manifest.md'), [
    '# Generation17 — GEN-101 «Живой дом»: GameScreen',
    '', `Тип доказательства: **${manifest.evidenceType}**`, `Commit: \`${commit}\`${dirty ? ' (рабочее дерево с изменениями)' : ''}`,
    `Seed ${SEED}, возраст ${ADULT_AGE}, viewport ${VIEWPORT.width}×${VIEWPORT.height} @1x, reduced motion`, `Воспроизведение: \`${REPRODUCE}\``, '',
    '| # | Файл | householdLook | Описание | sha256 кадра | sha256 Canvas |', '|---|------|---------------|----------|--------------|---------------|',
    ...publicFrames.map(f => `| ${f.order} | ${f.file} | ${f.householdLook} | ${f.note} | ${String(f.sha256).slice(0, 12)} | ${String(f.canvasSha256).slice(0, 12)} |`),
    '', '## Сравнения', `- ${manifest.comparisons.sharedVsOrdinary}`, `- ${manifest.comparisons.fallbackFrames}`, '', '## Ограничения', ...manifest.limitations.map(l => `- ${l}`), ''
  ].join('\n'))
  console.log(`Готово: ${frames.length} PNG + manifest в ${OUT_DIR}`)
}

main().catch(error => {
  console.error(error instanceof CaptureError ? `visual:capture:household FAILED: ${error.message}` : error)
  process.exit(1)
})
