# Generation17 · Техническая архитектура процедурных пиксельных сцен

**Редакция:** v1.1 · docs-консолидация [GEN-65](https://linear.app/generation17/issue/GEN-65) · 31.10.2026
**Источник:** независимая техконсультация [GEN-61](https://linear.app/generation17/issue/GEN-61), комментарий `10612d6b-f0e1-46e3-a9a6-e89db45c0134` (v0.1), принятое PROD-ревью `d750ade5-f51b-406c-a541-f148aae69cbe`.
**Проверено против кода:** `main@2f14edd94aeec1a296a3d12059a4a44d1667b707`.
**Платформа:** только ПК — мышь, клавиатура, изменение размера окна, масштаб браузера (решение владельца 31.10.2026). Бюджет p95 для мобильных, мобильный crop и 375px/touch-проверки исключены.

> **Вердикт: `FEASIBLE WITH CONSTRAINTS`.** Расширять Canvas 2D renderer целесообразно через **чистый resolver места/ситуации + registry сцен + общие рисовальные примитивы и процедурные props + специализированные room generators + кеш статических слоёв + управляемый animation scheduler**. Никаких новых gameplay RNG draws, сохранённых «кадров», скрытой географии корабля, WebGL-движка и PNG/AI-конвейера. Это **архитектурный план** (`GO FOR ARCHITECTURAL REVIEW`), а **не** разрешение на код: тесты, замеры и новая графика — `NOT RUN`.

## Метки статуса

`AS-IS` — подтверждено чтением кода на указанном коммите. `ACCEPTED DESIGN` — принятое направление для будущей реализации (после owner GO). `PROPOSED` — предложение/ориентир без принятия. `NOT APPROVED` — не утверждено. `NOT RUN` — не выполнялось, результат не заявляется. `DEPENDENCY` — решение за другим документом.

Нормативный стиль — только [PIXEL_SCENE_STYLE_GUIDE.md](PIXEL_SCENE_STYLE_GUIDE.md); покрытие и приоритеты — [PIXEL_SCENE_COVERAGE_PLAN.md](PIXEL_SCENE_COVERAGE_PLAN.md); смысл сигналов — [PIXEL_SCENE_NARRATIVE_SIGNALS.md](PIXEL_SCENE_NARRATIVE_SIGNALS.md); карта — [SHIP_MAP_CONCEPT.md](SHIP_MAP_CONCEPT.md). Цвета, света и материалов здесь не определяется.

## 1. Состояние реализации на commit `2f14edd`

### 1.1. Игровая сцена (`AS-IS`)

1. [`src/render/scene.ts`](../src/render/scene.ts): `SCENE_W=480`, `SCENE_H=270` (16:9); `SceneModel = name, age, wealth, sectorId, progress, companion, spot`; `SceneRenderer.draw(ctx, t, model)`; `pickScene` безусловно возвращает `cabinScene`. Нет registry, scene/room ID, признака подтверждённого места события и generic fallback.
2. [`src/render/cabin.ts`](../src/render/cabin.ts): геометрия и цвета прямым Canvas 2D; `WALLS` меняет оттенок стен по пяти `SectorId`; `buildStatic(sector, wealth)` рисует статическую подложку; `staticCache: Map<string, HTMLCanvasElement>` **без ограничения и вытеснения** (ключ `sector|wealth`); отдельный `glowSprite`; фиксированные `stars(90)`/`dust(22)` через `seeded`; терминал, растение, люди, `SPOTS`, виньетка. `hash32('cabin', sector, wealth)` — косметическая детерминированность, не gameplay RNG. `SceneModel.progress` каютой не используется. Подсветка окна выполняет порядка 180 `rect` за кадр (оценка исследования, не пересчитывалась).
3. [`src/render/draw.ts`](../src/render/draw.ts): `rect/line/disc/makeLayer/mix`; `makeLayer` вызывает `document.createElement('canvas')` — **не SSR-безопасно при вызове**. `rect` после рисования с `alpha≠1` сбрасывает `globalAlpha=1`, не сохраняя прежнее значение; управление состоянием контекста между слоями нужно централизовать.
4. [`src/render/people.ts`](../src/render/people.ts): `look(name, age)` через `seeded(hash32('look', name))`; `drawBackPerson` возвращает anchors рук/тела. Основной повторно используемый character primitive.
5. [`src/components/scene/SceneCanvas.vue`](../src/components/scene/SceneCanvas.vue): единственный `requestAnimationFrame`-цикл; `pickScene(props.model).draw(ctx, ts / 1000, model)` каждый кадр; `cancelAnimationFrame` только при размонтировании. **Нет паузы** по `document.hidden`/`IntersectionObserver`/`prefers-reduced-motion` и ограничения FPS. `imageSmoothingEnabled=false`, CSS `image-rendering: pixelated`, **но** CSS `aspect-ratio: 2.05/1`, `object-fit: cover` (для окна ≤ 560 px — `1.85/1`, историческая запись): кадр не совпадает с 480/270 ≈ 1.777 и может обрезаться; реальное отображение не измерено. `aria-label` зафиксирован: «Каюта: сцена из жизни героя» — станет неверным для других комнат.
6. [`src/components/scene/SceneView.vue`](../src/components/scene/SceneView.vue): `sectorId = residenceOf(g)` — сектор **дома**; `spot = store.currentMoment?.spot`; компаньон вычисляется из `parent/livingTogether/currentPartner`; над Canvas всегда HUD `Каюта ${g.value.birth.deck}`. После переезда `birth.deck` остаётся кодом сектора рождения и **не доказывает** код нынешней каюты. `latest = history[0]` — последний лог, а не физическая точка действия. Герой на сцене всегда в каюте; приоритет `pending` над `currentMoment` внутри модели не реализован.
7. [`src/domain/types.ts`](../src/domain/types.ts) и [`src/content/types.ts`](../src/content/types.ts): `SpotId = window/door/terminal/parent/table/plant` — цель подсветки, **не** идентификатор помещения; `MomentDef.spot` обязателен; `Storylet`/JSON-сюжеты и моменты **не имеют** `locationHint`/`sceneId`. [`src/content/validate.ts`](../src/content/validate.ts) проверяет `spot` как enum и метаданные нового помещения не примет без явного изменения валидатора. Примеры в [`moments.ts`](../src/domain/moments.ts): `m-terminal-copy` — школьный терминал, `m-night-archive` — учебный архив, `m-friend-run` — технический коридор при `spot = terminal/door` — вывод «каюта» или «конкретная комната» из `spot` неправомерен.
8. [`src/domain/birth.ts`](../src/domain/birth.ts): ровно пять `SectorId`; строки `A-6/E-2/B-4/D-1/C-3` — атрибуты секторов, **не** координаты и не граф проходов. [`LifeMapPanel.vue`](../src/components/panels/LifeMapPanel.vue) рисует прожитые годы, не карту корабля. Приложение — Vue/Vite Canvas 2D SPA; действующего SSR-пути для сцен нет.

### 1.2. Появилось в `main` после исследования (`AS-IS`)

Исследование писалось на `dbc211c`. С тех пор влиты GEN-81 (внешний вид A+C Refined v2.0) и GEN-85 (атлас корабля A0):

- [`src/components/panels/ShipAtlas.vue`](../src/components/panels/ShipAtlas.vue) — **первый** Canvas-потребитель в проекте с lifecycle: `visibilitychange` (скрытая вкладка → без rAF), `matchMedia('(prefers-reduced-motion: reduce)')` с реакцией на изменение (один статический кадр), накопление `elapsed` без скачка при возврате, `cancelAnimationFrame` и снятие слушателей на размонтировании. Лимита FPS нет. Это пример паттерна для scheduler, но **игровая сцена** `SceneCanvas.vue` его не использует.
- [`src/render/shipAtlas.ts`](../src/render/shipAtlas.ts) — чистая функция `drawShipAtlasSector(ctx, sector, seconds, motion)`; `SceneRenderer`/registry не используются. Unit-тесты: [`shipAtlas.test.ts`](../src/render/shipAtlas.test.ts), [`ui/shipAtlas.test.ts`](../src/ui/shipAtlas.test.ts), [`pilgrimArkV2.test.ts`](../src/render/pilgrimArkV2.test.ts) (результаты прогона для коммита здесь не заявляются).
- Canvas атласа имеет `width=480 height=270` и CSS `width:100%; height:auto` — естественное 16:9 без `cover`.

Draft PR [#13](https://github.com/MaksimOrekhov/generation17/pull/13) (GEN-90, переключаемые сцены) в `main` **не влит** и здесь не описывается как реализованный; после слияния §1.1 нужно сверить заново.

## 2. Инварианты (P0 — нарушать нельзя; `ACCEPTED DESIGN`)

- Рендер **read-only**: ни `GameState`, ни `Person`, ни `g.rng`, ни `flags/seen/decisions/history`, ни clock/save не меняются при выборе сцены, создании слоя, кадре или переключении reduced-motion. **Ноль** вызовов `random(g)`, `pick(g)`, `Math.random()` для визуала. Единый seed/domain id делает результат воспроизводимым при одинаковых данных и фиксированном `t`.
- **Где живу ≠ где сейчас событие.** `residenceOf` — только домашний сектор; `birth.deck` — сектор рождения; `SpotId` — только объект/зона момента; `protagonist.job` и `Person.state.sectorId` — не факт посещения рабочего места; `tone/tags/category` — не место. Не выводить расположение по предметам, названию, профессии, сектору собеседника или последней записи истории.
- Видимая подпись места, изображённая обстановка и Canvas aria-описание **согласованы с одним resolved scene context**. Если локация не подтверждена, не подписывать конкретную каюту/клинику/архив. Допустимы явно помеченная **«Иллюстрация эпизода»** или нейтральная абстрактная корабельная сцена без утверждения физического присутствия.
- Рендер не подменяет игровые последствия анимацией: никаких автоматически разыгранных смерти, посещения NPC, свадьбы, ранения, побега, ужаса или соседнего помещения без подтверждённого контекста события. Картинка не создаёт возможности хода/перемещения.
- Сохраняются сетка **480×270**, узнаваемые персонажи из `people.ts`, пиксельная резкость, фактическое состояние компаньона (`alive/present/cohabit`), приоритет активных сюжетов и финала. Единственный нормативный цвет/свет/материал — STYLE_GUIDE; каталог families — COVERAGE_PLAN.

## 3. Resolver: sceneId / locationHint / variants

**Три оси** (`ACCEPTED DESIGN`):

1. **`locationHint`** — только подтверждённая сценаристом/состоянием физическая локация с `provenance` (`explicit-event` или `idle-home`) и уровнем точности; либо `unknown`.
2. **`sceneId`** — ключ семейства *изображений* из registry (`cabin`, `corridor`, `archive`, `workshop` — **примеры**, а не утверждённый каталог), не доказательство присутствия героя само по себе.
3. **`variantId` + `spot`** — композиция, возрастные/предметные/световые варианты и hotspot; hotspot допустим только если существует в выбранном renderer, иначе `null` (не «нарисовать окно там, где его нет»).

**Иллюстрация API — `PROPOSED`, не код для merge:**

```ts
type SceneLocation =
  | { kind: 'room'; roomId: RoomId; sectorId?: SectorId; source: 'event' }
  | { kind: 'sector'; sectorId: SectorId; source: 'event' }
  | { kind: 'home'; sectorId: SectorId; source: 'idle-home' }
  | { kind: 'unknown' }

interface SceneRequest {
  seed: number
  event?: { id: string; source: 'pending-storylet' | 'visible-moment'; locationHint?: SceneLocation }
  homeSectorId: SectorId
  age: number
  wealth: number
  companion: SceneModel['companion']
  spot: SpotId | null
  // Только фактические/утверждённые сигналы. Не передавать mutable GameState целиком.
}
interface SceneSelection {
  sceneId: string
  variantId: string
  presentation: 'literal-location' | 'idle-home' | 'illustrative'
  locationLabel: string | null
  ariaDescription: string
  spot: SpotId | null
  fallbackReason?: 'missing-hint' | 'unknown-scene' | 'unsupported-room' | 'unknown-spot'
}
```

**Приоритет resolver** (чистый, без random и записи состояния):

1. Сначала активное `pending`-решение с проверенным explicit `locationHint` из определения выбранного storylet (если решению действительно сопутствует иллюстрация); при отсутствии — `unknown/illustrative`, **не** `home`. Предыдущий `currentMoment.spot` не отображается принудительно при блокирующем решении.
2. Затем **фактически видимый** `currentMoment` и его explicit `locationHint`; сам `moment.spot` уверенность не повышает. Момент с неизвестным местом — нейтральная иллюстрация (или явно обозначенный домашний фон **не как место события**); подсветка — только при совместимом renderer. `stopped/result` — отдельный presentation mode без несуществующего разговора.
3. Нет активного локализованного события → default **домашняя каюта** (`residenceOf(g)`) с возрастными и экономическими вариантами. Рисование дома не доказывает, что там произошёл последний `history[0]`.
4. Подтверждённая конкретная room → ищется registry mapping; если комната не реализована, **не подменять** её другой буквальной, а использовать neutral/illustrative fallback и честную подпись по hint (либо без подписи).
5. Известен только сектор → допустима лишь утверждённая секторная иллюстрация без помещения с обозначением именно сектора («клиника» по `clinic`-сектору не «я в клинике»). Нет такой family — нейтральный fallback.
6. `sceneId`/variant выбирается только после проверки evidence; декоративное разнообразие — `hash32('scene-visual-v1', seed, sceneId, variantGroup, semanticKey)` **только среди разрешённых** контекстом вариантов. Из `wealth` место события не выводится.

**Порог для нового JSON (P0, `NOT APPROVED`):** для точной сцены вне дома в `JsonStorylet`/`JsonMoment` понадобится **опциональный** `locationHint`/утверждённый `roomId` (а `sceneId` — как предпочтение, не замена проверки). Согласовать с геймдизайном, нарративом и продюсером **до изменения схемы**. Порядок: JSON type → строгий статический validator (известные room/sector/комбинации; `spot` отдельно) → compiler `compileStorylet/compileMoment` → resolver в `SceneView` → registry. Неразмеченный legacy-контент остаётся валидным и не получает выдуманной локации; `GameState.schemaVersion` без bump; старые `pending/moment` разрешаются по существующим stable ID. В сохранения не добавляются координаты. COVERAGE_PLAN должен дать матрицу room↔storylets с отметкой `confirmed/proposed/unknown`. Допустим и более скромный путь: **курируемый список точных активных event ID** с доказанными room (без изменения схемы), если его достаточно.

## 4. Устройство render-пакета (`ACCEPTED DESIGN`)

Модульный renderer, **не** фабрика на 100 условий и **не** файл на каждое сочетание:

```text
SceneView (immutable render context, priority, truthful labels)
  └─ resolveScene(request)  [PURE, testable, no DOM]
       └─ sceneRegistry: id → room renderer + supported variants/hotspots
SceneCanvas (one controlled scheduler; static fallback, aria, scale)
  └─ renderer.draw(ctx, t, frozen model)
       ├─ shared draw (rect/line/disc, panels, trims, windows, pipes, lighting)
       ├─ background / opaque static layer   [LRU cache]
       ├─ fixed props / foreground static     [cache when worthwhile]
       ├─ people (existing look + drawBackPerson/anchors)
       ├─ animated props & particles          [bounded, deterministic t]
       ├─ context-only effects / hotspots     [validated]
       └─ post-light / vignette                [approved by ART]
```

- **Scene family** владеет геометрией, смысловой композицией, набором anchor slots, допустимыми props/hotspots и раздельными static/dynamic draw. **Общие kit-компоненты** (корабельные конструкции, материалы, рамы, вентиляция, двери, световые акценты, процедурные силуэты) — только по STYLE_GUIDE; `people.ts` остаётся единой точкой лица, кожи, волос, возраста. **Variants** — надстройка, а не новый renderer на «возраст × место × тон»: `ageBand`, `wealth`, `approvedLighting`, `propSet`, `optionalCharacters`, `effectProfile`, `visualSeed`. `cabin.SPOTS` произвольно в каждую комнату не переносится.
- **Registry:** явный неизменяемый mapping `id → {version, createRenderer, allowedRoomIds, supportedSpots, fallback, staticKey}`, проверяемые уникальные имена/ссылки. Неизвестный ключ = безопасная нейтральная иллюстрация, **никогда** crash и не ложная буквальная подпись. `version` служит ключом render/cache (`cabin@2`), а не `GameState.schemaVersion`; registry в сохранение не попадает. MVP — статические imports; ленивый `import()` (с fallback на время загрузки) — только на UI-уровне и при росте числа family. Предзагрузка не читает и не выбирает будущее событие.
- **Статика/динамика:** `staticKey` включает `renderer.version, sceneId, variantId, sectorId, wealth, staticVisualSeed` и только свойства, реально меняющие подложку (возраст — лучше `ageBand`, если он меняет статический реквизит). Не включать `t`, `progress` и мелкие UI-изменения. Перестройка при смене ключа/версии. `draw()` начинает кадр с целостного backbuffer/clear и сброшенного состояния (alpha, composite, transforms); каждый слой — `ctx.save()/restore()`. `GameState` не клонируется на каждый кадр.

## 5. Детерминизм и scheduler (`ACCEPTED DESIGN`)

- Источник «декоративной случайности» — только hash/seeded с разными namespace на family/variant/prop/person; без `Math.random` и без `g.rng`. При одинаковом `SceneSelection`, замороженной модели и заданном `t` кадр воспроизводим (в одной браузерной среде). Абсолютный timestamp `rAF` не часть сохранения и не обещает идентичную фазу после перезагрузки — важны стабильные идентичность и раскладка, а не совпадение фазы вентилятора до миллисекунды.
- **Один scheduler** в `SceneCanvas`; анимируемое время — *visual elapsed time*, не `game.age/shipYear/progress`. `t` явно передаётся в renderer. Для `prefers-reduced-motion` — **один статичный смысловой кадр** при (пере)монтировании/изменении модели, без постоянного rAF, мерцания и динамической подсветки. Для `document.hidden` или элемента вне viewport — `cancelAnimationFrame` и freeze; при возврате не «догонять» огромным `dt`. В режимах `result/pending/ended` никаких gameplay-таймеров.
- **Ограничение FPS / адаптивное качество** (`PROPOSED`): стартовый кандидат **30 FPS**, измерить на целевых ПК; при низком FPS уменьшать только число декоративных частиц/освещения, не скрывая важные фигуры, события и подсветки. При полной статике можно рисовать только при смене модели. Предпочтительны локальные короткие циклы (`Math.sin`, конечные шаги, ограниченный count), а не stateful `random` внутри `draw`.
- **Без нового ввода:** существующие выборы остаются HTML-компонентами и доступны с клавиатуры; Canvas — `role="img"` с вычисляемым truthful aria-label/description (family, подтверждённая локация или «иллюстрация»), без дублирования сюжета. Hotspots информативны визуально и не заменяют DOM-управление; интерактивные области Canvas, если ART их предложит, требуют отдельной архитектуры клавиатуры/фокуса.

## 6. Производительность, память, отображение (бюджеты — `PROPOSED`, замеров нет — `NOT RUN`)

- Один logical canvas 480×270 = 129 600 px; несжатая RGBA-подложка ≈ **506 KiB**. Текущие потенциальные `5 секторов × 5 достатков = 25` статических вариантов каюты ≈ **12.4 MiB на один слой** без накладных расходов браузера, glow и других комнат — расчётная верхняя оценка, не измеренный heap/GPU. Нельзя множить на десятки family без вытеснения.
- **LRU-кеш статических слоёв**, общий для family: ленивое создание, предварительный потолок **24–32 MiB nominal RGBA**, лимит по числу элементов/мегапикселей, независимые версии и `dispose` при вытеснении. GPU/browser-память может быть больше nominal — проверять Memory/Performance при 30+ вариантах. Варианты дешевле двух кадров CPU лучше рисовать динамически.
- **Бюджет-кандидат:** p95 draw+compose **≤ 8 мс на десктопном baseline-устройстве**; устойчивые ≈ 30 FPS на переднем плане; hidden/reduced ≈ 0 фоновых кадров; без длинных задач при первом построении. Это *предлагаемые* SLO для QA/ART, **не** результаты. Измерять `performance.now` до/после draw, отдельно static build, наклон памяти и JS long tasks при 1/5/25/50 вариантах; фиксировать браузер, ОС, устройство, масштаб; 60-секундные окна, bootstrap и warm-cache раздельно. Если медленно — сначала сократить число процедурных `rect` в часто обновляемых областях (highlight, частицы), затем качество; WebGL/worker — только при доказанном узком месте.
- **Отображение на ПК** (`ACCEPTED DESIGN`): backing store 480×270 без сглаживания; stage CSS — `width:100%; height:auto; aspect-ratio:480/270; object-fit:contain`, **без смысловой обрезки** (letterbox лучше потери персонажа, hotspot, подписи). На большом окне — nearest-neighbor и по возможности целочисленный масштаб с центрированием; при произвольном размере окна допустим нецелый nearest-neighbor, но кадр остаётся целым. Backing resolution не умножается на DPR автоматически (×4 пикселей при DPR 2 и изменение художественной сетки); режим DPR — отдельное визуальное одобрение. HUD, кнопки и подписи — DOM поверх сцены; проверка при масштабе браузера 200% и длинных локализованных текстах. Aria-label и HUD-подпись места берут **один** итог resolver, не жёсткое «Каюта». Текущий CSS каюты (`cover`) остаётся `AS-IS` и отдельной регрессией; переход на `contain` — отдельная реализационная задача с ART-sign-off ([STYLE_GUIDE §2.2](PIXEL_SCENE_STYLE_GUIDE.md)).
- **Деградация:** без `window/document` при импорте модуля; `makeLayer`/инициализация контекста — только после клиентского mount, с проверкой `getContext('2d') !== null` и статическим текстовым fallback; снятие слушателей (visibility, media query, intersection) и отмена rAF на размонтировании; HMR/несколько экземпляров не растят кеш безлимитно. «SSR-совместимость» означает безопасный импорт и отсутствие DOM до `onMounted`, а не утверждение, что SSR реализован.

## 7. Схема модулей (только при согласованном implementation ticket)

- [`src/render/scene.ts`](../src/render/scene.ts): уточнить `SceneRequest/Selection/Registry`, обратную совместимость `SceneModel`, убрать безусловный `cabin` из `pickScene`.
- Новые `src/render/sceneResolver.ts`, `sceneRegistry.ts`, `sceneCache.ts`: pure selection, ограниченный LRU, явный fallback; общие `palette/props/light` — по STYLE_GUIDE.
- `cabin/draw/people`: адаптер прежней каюты, извлечение общих примитивов без визуального дрейфа; новые комнаты — отдельными family-модулями. Не переписывать всё сразу.
- `SceneCanvas.vue`/`SceneView.vue`: scheduler/visibility/reduced, показ полного кадра, единый resolved place/aria/HUD, приоритет `pending → moment → idle`.
- **Только после отдельного content GO:** `src/content/{types,validate,load}.ts` и при необходимости `src/domain/types.ts` для опциональных room hints; `content/storylets/*.json` и moments — только доказуемая авторская разметка. `stores/game.ts`, `domain/engine.ts`, `domain/random.ts`, `domain/save.ts`, gameplay clock/RNG/history/schema **не изменяются** ради изображений. `LifeMapPanel` не превращается в карту корабля.
- Документная зависимость: согласованные `docs/PIXEL_SCENE_{STYLE_GUIDE,COVERAGE_PLAN,TECH_SPEC,NARRATIVE_SIGNALS}.md` и `docs/SHIP_MAP_CONCEPT.md` собираются в отдельной ветке (этот комплект).

## 8. Этапы внедрения после owner GO (`ACCEPTED DESIGN`)

Единая нумерация и связь с покрытием — [COVERAGE_PLAN §9.1](PIXEL_SCENE_COVERAGE_PLAN.md). Здесь TECH-этапы:

- **TECH-B0 — основа / parity:** resolver + registry + ограниченный кеш + canvas lifecycle/reduced/visibility + показ полного кадра/aria + буквальная idle-каюта; neutral fallback для событий без подтверждённой комнаты. Визуальная регрессия каюты не больше допустимой по STYLE_GUIDE; **новых комнат нет, gameplay-diff нет.**
- **TECH-B1 — подтверждённые комнаты:** 2–3 подтверждённые room families из COVERAGE_PLAN, общие палитра/props/персонажи; контентные `locationHint` — только по утверждённой разметке; проверка на реальных историях (приоритет моментов и решений, неизвестные места, `livingTogether`, время без активного события).
- **TECH-B2 — покрытие:** расширяемые variants по возрасту/реквизиту/свету/жанровым сигналам **только на доказанных фактах**; десятки различимых сочетаний вместо тысячи файлов; LRU/perf-регрессия; затем отдельная концепция карты.

GAME-B0 (≈ 9–10 families) — *покрытие*, достигаемое после TECH-B0/B1, а не требование первого PR. Жёсткой количественной отсечки без матрицы COVERAGE_PLAN нет.

**Обязательные тесты / P0 release gates** (все — `NOT RUN`, формулируются для будущей реализации):

1. **Pure resolver, табличные юнит-тесты:** idle home; explicit known room; explicit sector-only; unannotated pending → illustration; visible moment `spot=terminal` с явным архивом → архив (не каюта); `spot=door` без room → не «коридор»; pending + устаревший moment → приоритет pending; unknown room/scene → neutral; старый JSON без hint принимается без выдуманной локации; deck сектора, возраст, job, последняя история не считаются доказательством места.
2. **Статический validator + compiler:** known enum room, optional metadata, конфликт room/sector, неподдерживаемый variant/hotspot, опечатка и unknown id отклоняются на `content:check`; legacy storylets/moments компилируются как раньше, доступность/веса/выдача директора не меняются от visual hints.
3. **RNG/read-only:** deep-freeze snapshot `GameState`; 100 выборов сцен/кадров при фиксированных `t` → `game.rng`, `seed`, `shipYear`, `seen`, `pending`, `moments`, `history`, `Person` неизменны. Одинаковые данные и `t` → одинаковый selection и pixel hash в одинаковой среде; другой seed меняет только разрешённые детали, не факт локации.
4. **Кеш/перф:** один `staticKey` → одна сборка; другой ключ → другая подложка; LRU не превышает лимит; активная анимация не перестраивает статический слой каждый кадр; 30+ вариантов без линейной утечки; p50/p95 redraw и warm/cold build на фиксированном устройстве. `getContext('2d')` = null → доступный статический fallback.
5. **Lifecycle/браузер (desktop):** скрытая вкладка → нет запланированных кадров, возврат без скачка фазы; live-переключение reduced-motion on/off → один кадр без мерцания и обратно; размонтирование → 0 слушателей/rAF; нет дубликатов цикла при смене сцены/HMR. Реальные: масштаб браузера 200%, DPR 1/2, полный кадр 16:9 без crop, HUD и `MomentPopup` не обрезаются, честный aria, клавиатура и экранный диктор десктопа.
6. **Покрытие и честность контента:** выборки 8/24 заранее зафиксированных биографий — счётчики `explicitLocation / unknownLocation / supportedLiteral / illustrativeFallback / mismatchedSpot / unsupportedRoom` по фактическому ID storylet/moment. ART сравнивает силуэты/материал/свет с каютой; нарратив сверяет, что сигнал не утверждает неизбранное действие. Это диагностика покрытия, не подмена человеческого UI-теста.
7. **Save/no-gameplay регрессия:** `npm run content:check`, `npm run typecheck`, `npm test`, `npm run build`; одинаковые gameplay-трассы по seed с обновлённым визуальным registry и без него дают одинаковые снимки состояния; RNG draws и поля `GameState` ради сцен не добавляются.

## 9. Риски P0/P1 и минимальные защиты

| Важность | Риск | Защита / gate |
|---|---|---|
| **P0** | Ложное физическое место: `residenceOf`/`spot`/профессия выдаются за текущую комнату; «Каюта A-6» после переезда | Типизированный evidence-aware resolver, unknown → нейтральная иллюстрация, единый place-label+aria, explicit event hints только после owner-approved контракта |
| **P0** | Декоративный `random(g)`/изменение сохранения или авто-время влияют на смертность/выбор/детерминизм | Pure read-only модель, namespaced `hash32`, frozen-state/gameplay parity тесты; никаких timers и мутаций store |
| **P1** | Неограниченный `staticCache` × families × возраст×сектор×достаток и дорогой полный redraw на rAF | Общий LRU, ограниченные варианты, кап FPS/redraw при простое, бюджет перф/памяти, замеры на устройстве |
| **P1** | `document.hidden`/reduced-motion игнорируются: лишняя нагрузка и анимации для чувствительных пользователей | Visibility + IntersectionObserver + media-query lifecycle, статичный кадр, teardown; desktop a11y gate |
| **P1** | Показ с `cover`/2.05:1 обрезает смысловые детали (AS-IS) | CSS по 480/270, `contain`/без crop, чек-лист безопасной зоны ART, desktop-проверка полного кадра |
| **P1** | Жёсткие aria-label/место «Каюта», коллизия `sceneId`, несовместимый hotspot, пустой Canvas | Валидируемый registry, типизированный fallback, динамическое truthful-описание, aria/DOM fallback, content checks |
| **P1** | Процедурные генераторы теряют единый стиль, дублируют `people`/материалы | STYLE_GUIDE + shared kit + сравнение снимков, ART-приёмка |

## 10. Связь с картой корабля

Рендер сцен и ship map могут разделять лишь подтверждённые `SectorId`, названия/`deck` из `birth.ts` и позднее — согласованные room IDs. `locationHint` подходит карте только как уровень достоверности *«сектор известен / помещение подтверждено / неизвестно»*. Сейчас **нет** координат, порядка палуб, графа смежности, времени переходов, расстояний и путей; из `A-6/E-2/B-4/D-1/C-3` их не выводить. Карта может *предложить* `ShipTopology` и совместимые room anchors, но утверждение — за геймдизайном, нарративом, ART, продюсером и владельцем. `LifeMapPanel` — карта жизни, а не источник топологии. Подробности — [SHIP_MAP_CONCEPT.md](SHIP_MAP_CONCEPT.md).

## 11. Решение и открытые вопросы

**FEASIBLE WITH CONSTRAINTS.** Ядра Canvas/людей/каюты достаточно для архитектуры процедурных scene families; главное препятствие — не графика, а **отсутствие event-time room truth** в текущем JSON и неправдивый вывод «каюта» из домашнего сектора. Малый first implementation gate:

1. STYLE_GUIDE утверждает визуальные токены и эталон;
2. COVERAGE_PLAN фиксирует первые room families и mapping с отметкой `explicit/unknown`;
3. продюсер/владелец отдельно разрешают опциональные метаданные места события и TECH-B0/B1;
4. QA готовит desktop-браузерные/перфоманс-матрицы и seed-матрицы.

До этого нельзя обещать «правильную комнату во всех сюжетах». Открытые вопросы (без автоматического утверждения): нужна ли схема `locationHint` (и её имя); окончательное значение FPS-капа и бюджета p95 (требуют замеров); как именно показывать иллюстрацию вне подтверждённого места (UX); переход каюты на `contain` (ART).
