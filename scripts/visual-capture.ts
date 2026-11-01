/**
 * Захват реальных скриншотов GameScreen для шести DEV-fixture режимов SceneView.
 *
 *   npm run visual:capture                  → artifacts/visual-capture/
 *   OUT_DIR=путь npm run visual:capture     другой каталог
 *
 * Скрипт поднимает настоящий Vite dev-сервер (DEV-fixture существуют только при import.meta.env.DEV),
 * открывает приложение в чистом headless Chromium, проходит экран рождения кнопкой «Начать жизнь»
 * и снимает PNG уже работающего GameScreen. Игровой код не изменяется и не подменяется:
 * фиксированный seed передаётся обычным сохранением (`createGame(seed)` → localStorage), которое
 * приложение само читает при старте.
 *
 * Любая невыполненная проверка завершает процесс с кодом 1 и причиной; PNG сам по себе не является
 * художественным одобрением и не доказывает анимацию, UX или непрерывность геймплея.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Browser, ConsoleMessage } from 'playwright'
import { createServer } from 'vite'
import { DEFAULT_PRESET } from '../src/domain/clock'
import { residenceOf } from '../src/domain/birth'
import { createGame } from '../src/domain/engine'
import { SCENE_H, SCENE_W, resolveScene } from '../src/render/scene'
import type { SceneContext } from '../src/render/scene'

const SEED = 17017
const VIEWPORT = { width: 1440, height: 900 }
const STORAGE_KEY = 'generation17-v2'
const TIMEOUT_MS = 30_000
const OUT_DIR = resolve(process.env.OUT_DIR ?? 'artifacts/visual-capture')
const REPRODUCE = 'npm ci && npx playwright install chromium && npm run visual:capture'

/** Порядок и имена файлов стабильны. Ожидаемый контракт задан здесь независимо от SceneView. */
const FIXTURES = [
  { id: 'home', momentId: null, momentSpot: null, badge: 'FIXTURE · home' },
  { id: 'neutral', momentId: 'm-terminal-copy', momentSpot: 'terminal', badge: 'FIXTURE · neutral' },
  { id: 'archive', momentId: 'm-night-archive', momentSpot: 'terminal', badge: 'FIXTURE · archive' },
  { id: 'greenhouse', momentId: 'm-job-agro', momentSpot: 'plant', badge: 'FIXTURE · greenhouse' },
  { id: 'observation', momentId: 'm-night-deck', momentSpot: 'window', badge: 'FIXTURE · observation' },
  { id: 'infant', momentId: null, momentSpot: null, badge: 'FIXTURE · infant · age=0' }
] as const satisfies readonly { id: string; momentId: string | null; momentSpot: SceneContext['momentSpot']; badge: string }[]

class CaptureError extends Error {}

function fail(message: string): never {
  throw new CaptureError(message)
}

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

async function main() {
  const startedAt = new Date()
  const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD') || 'unknown'
  const dirty = git('status', '--porcelain') !== ''

  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const seeded = createGame(SEED)
  const residence = residenceOf(seeded)
  const save = JSON.stringify({ game: seeded, started: false, preset: DEFAULT_PRESET })

  const { chromium } = await import('playwright')
  let browser: Browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    fail(`Не удалось запустить Chromium (${(error as Error).message.split('\n')[0]}). Выполните: npx playwright install chromium`)
  }

  const server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false }
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') fail('Vite dev-сервер не вернул порт')
  const origin = `http://127.0.0.1:${address.port}`

  const frames: Record<string, unknown>[] = []
  try {
    for (const [index, fixture] of FIXTURES.entries()) {
      const expected = resolveScene({
        started: true, momentId: fixture.momentId, momentSpot: fixture.momentSpot,
        pendingStorylet: false, hasDecision: false, resultVisible: false, stopped: false, shopOpen: false,
        residenceSectorId: residence
      })
      const file = `${String(index + 1).padStart(2, '0')}-${fixture.id}.png`
      const problems: string[] = []
      const where = `[${fixture.id}]`

      // Чистый контекст на каждый кадр: пустое хранилище, фиксированный viewport/DPR, reduced motion.
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
        await page.goto(`${origin}/?sceneFixture=${fixture.id}`, { waitUntil: 'load' })
        const begin = page.getByRole('button', { name: /Начать жизнь/ })
        await begin.waitFor().catch(() => fail(`${where} экран рождения не появился (кнопка «Начать жизнь»)`))
        await begin.click()
        await page.locator('.game__col--center [data-test="scene-canvas"]').waitFor()
          .catch(() => fail(`${where} GameScreen/SceneView не открылся после старта жизни`))
        // Время ставим на паузу, чтобы кадр не зависел от того, сколько миллисекунд идёт жизнь.
        const pause = page.getByRole('button', { name: /Пауза/ })
        if (await pause.count()) await pause.first().click()

        // Обучающая подсказка перекрывает левую колонку; закрываем её штатной кнопкой интерфейса.
        const gotIt = page.getByRole('button', { name: 'Понятно' })
        if (await gotIt.count()) await gotIt.first().click()

        await page.evaluate(() => document.fonts.ready)
        await page.waitForFunction(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-test="scene-canvas"]')
          const ctx = canvas?.getContext('2d')
          if (!canvas || !ctx) return false
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          const colours = new Set<number>()
          for (let i = 0; i < data.length && colours.size < 8; i += 4) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
          return colours.size >= 8
        }, undefined, { timeout: TIMEOUT_MS }).catch(() => fail(`${where} Canvas остался пустым или однотонным за ${TIMEOUT_MS} мс`))
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

        const seen = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-test="scene-canvas"]')
          const column = document.querySelector('.game__col--center')
          const rect = canvas?.getBoundingClientRect()
          const badges = [...document.querySelectorAll('.scene__fixture')].map(el => el.textContent?.trim() ?? '')
          const tags = [...document.querySelectorAll('.scene__hud .scene__tag')].filter(el => !el.classList.contains('scene__fixture') && !el.classList.contains('scene__attn'))
          return {
            sceneVisible: !!document.querySelector('.game__col--center section.scene'),
            canvasInColumn: !!canvas && !!column && column.contains(canvas),
            backing: canvas ? [canvas.width, canvas.height] : null,
            rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
            ariaLabel: canvas?.getAttribute('aria-label') ?? null,
            badges,
            placeTag: tags[0]?.textContent?.trim() ?? null,
            canvasPixels: canvas ? canvas.toDataURL('image/png') : null,
            birthStillVisible: !!document.querySelector('.birth__go'),
            storedSeed: (() => { try { return JSON.parse(localStorage.getItem('generation17-v2') ?? '{}').game?.seed ?? null } catch { return null } })()
          }
        })

        if (!seen.sceneVisible || !seen.canvasInColumn) problems.push('SceneView не найден в центральной колонке GameScreen')
        if (seen.birthStillVisible) problems.push('экран рождения всё ещё показан')
        if (!seen.backing || seen.backing[0] !== SCENE_W || seen.backing[1] !== SCENE_H) problems.push(`backing size Canvas ${seen.backing?.join('×')} ≠ ${SCENE_W}×${SCENE_H}`)
        if (!seen.rect || seen.rect.width < 400 || seen.rect.x < 0 || seen.rect.y < 0 || seen.rect.x + seen.rect.width > VIEWPORT.width || seen.rect.y + seen.rect.height > VIEWPORT.height) {
          problems.push(`Canvas не помещается в viewport целиком: ${JSON.stringify(seen.rect)}`)
        }
        if (seen.badges.length !== 1 || seen.badges[0] !== fixture.badge) problems.push(`FIXTURE badge: ожидался «${fixture.badge}», найдено ${JSON.stringify(seen.badges)}`)
        if (seen.placeTag !== expected.label) problems.push(`подпись места: ожидалась «${expected.label}», найдена «${seen.placeTag}»`)
        if (seen.ariaLabel !== expected.ariaLabel) problems.push(`aria-label Canvas: ожидался «${expected.ariaLabel}», найден «${seen.ariaLabel}»`)
        if (seen.storedSeed !== SEED) problems.push(`seed в сохранении ${seen.storedSeed} ≠ ${SEED}`)

        const png = await page.screenshot({ type: 'png', animations: 'disabled' })
        if (problems.length) fail(`${where} ${problems.join('; ')}`)
        writeFileSync(join(OUT_DIR, file), png)
        frames.push({
          order: index + 1,
          fixture: fixture.id,
          file,
          sha256: createHash('sha256').update(png).digest('hex'),
          canvasSha256: createHash('sha256').update(seen.canvasPixels ?? '').digest('hex'),
          sceneKey: expected.sceneId,
          fixtureBadge: fixture.badge,
          placeLabel: expected.label,
          canvasAriaLabel: expected.ariaLabel,
          canvasBacking: `${SCENE_W}×${SCENE_H}`,
          canvasRect: seen.rect,
          checks: 'passed'
        })
        console.log(`✓ ${file}  ${fixture.id} → ${expected.sceneId}`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }

  const manifest = {
    evidenceType: 'DEV FIXTURE • IN-GAME SCREENSHOT',
    commit,
    workingTreeDirty: dirty,
    generatedAt: startedAt.toISOString(),
    command: REPRODUCE,
    seed: { value: SEED, mechanism: 'createGame(seed) записан в localStorage как обычное сохранение до загрузки приложения; Math.random не подменялся' },
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    browser: 'Chromium (Playwright, headless)',
    determinism: 'пиксели Canvas (canvasSha256) воспроизводимы между прогонами; полный кадр может отличаться в полосе времени TopBar, пока пауза не применилась',
    time: 'после старта жизни кнопкой «Начать жизнь» часы ставятся на паузу кнопкой «Пауза»',
    frames,
    limitations: [
      'Снимки сделаны на DEV-fixture (?sceneFixture=…), а не в реальном ходе игры; infant — возрастная композиция age=0, не шестая игровая сцена.',
      'Статичный кадр при reduced motion: движение/анимация не доказываются.',
      'Не доказывают UX, непрерывность геймплея и не являются художественным одобрением (ART PASS).',
      'Проверены: SceneView в центральной колонке, FIXTURE badge, подпись места, aria-label и backing 480×270 Canvas, отсутствие JS-ошибок, непустой Canvas.'
    ]
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const rows = frames.map(f => `| ${f.order} | ${f.file} | ${f.fixture} | ${f.sceneKey} | ${String(f.sha256).slice(0, 12)} | ${String(f.canvasSha256).slice(0, 12)} |`).join('\n')
  writeFileSync(join(OUT_DIR, 'manifest.md'), [
    '# Generation17 — GameScreen visual capture',
    '',
    `Тип доказательства: **${manifest.evidenceType}**`,
    `Commit: \`${commit}\`${dirty ? ' (рабочее дерево с изменениями)' : ''}`,
    `Время: ${manifest.generatedAt}`,
    `Seed: ${SEED} · viewport ${VIEWPORT.width}×${VIEWPORT.height} @1x · prefers-reduced-motion: reduce`,
    `Воспроизведение: \`${REPRODUCE}\``,
    '',
    '| # | Файл | Fixture | Scene key | sha256 кадра | sha256 Canvas |',
    '|---|------|---------|-----------|--------------|---------------|',
    rows,
    '',
    '## Ограничения',
    ...manifest.limitations.map(l => `- ${l}`),
    ''
  ].join('\n'))
  console.log(`Готово: ${frames.length} PNG + manifest в ${OUT_DIR}`)
}

main().catch(error => {
  console.error(error instanceof CaptureError ? `visual:capture FAILED: ${error.message}` : error)
  process.exit(1)
})
