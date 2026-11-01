# Захват скриншотов GameScreen (DEV fixtures)

Повторяемый способ получить шесть PNG настоящего `GameScreen` для приёмки ART/QA:
`home`, `neutral`, `archive`, `greenhouse`, `observation`, `infant` (порядок и имена `01-home.png` … `06-infant.png` стабильны).
В кадре — весь интерфейс 1440×900: реальный `SceneView` в центральной колонке, HUD и бейдж `FIXTURE`.

## Локально (Windows / Linux / macOS)

```bash
npm ci
npx playwright install chromium
npm run visual:capture
```

Результат: `artifacts/visual-capture/` (в `.gitignore`) — шесть PNG, `manifest.json`, `manifest.md`.
Другой каталог: `OUT_DIR=путь npm run visual:capture`.

## GitHub Actions

Workflow `Visual capture` запускается вручную (`workflow_dispatch`) и на PR, которые меняют скрипт захвата,
`src/render/**`, `src/components/scene/**`, `GameScreen.vue`, стили или зависимости. Artifact
`gamescreen-visual-capture-<sha>` лежит на странице запуска (Actions → run → Artifacts), хранится 14 дней.
Workflow не использует секретов, имеет права `contents: read` и ничего не пишет в PR.

## Как это работает

1. Поднимается настоящий Vite dev-сервер (DEV-fixture работают только при `import.meta.env.DEV`).
2. Для каждого кадра создаётся чистый контекст Chromium: пустое хранилище, 1440×900, DPR 1, `prefers-reduced-motion: reduce`.
3. Фиксированный seed `17017` кладётся в `localStorage` как обычное сохранение (`createGame(seed)`) до загрузки приложения; `Math.random` и код игры не подменяются.
4. Скрипт нажимает «Начать жизнь», ставит время на паузу, закрывает обучающую подсказку и ждёт, пока Canvas отрисован.
5. Проверяется: SceneView в центральной колонке, ровно один бейдж `FIXTURE` с ожидаемым текстом, подпись места и `aria-label` совпадают с `resolveScene`, Canvas 480×270 целиком в viewport и не пустой, нет `pageerror`/`console.error`. При любом нарушении процесс завершается с кодом 1 и причиной.

Пиксели Canvas воспроизводимы между прогонами (`canvasSha256` в manifest). Полный кадр может отличаться в полосе времени TopBar,
потому что пауза применяется после старта жизни.

## Ограничения

Снимки — DEV-fixture, не реальный ход игры; `infant` — возрастная композиция `age=0`, а не шестая сцена.
Они не доказывают движение, UX и непрерывность геймплея и **не являются автоматическим ART PASS**.

## Передача ART/QA

Скачайте zip artifact и откройте пиксели шести PNG. Доступ агентов к artifact или user-attachments не гарантирован:
если он недоступен, владелец прикладывает те же шесть PNG прямо в чат ART. Ссылка сама по себе не является проверкой.
