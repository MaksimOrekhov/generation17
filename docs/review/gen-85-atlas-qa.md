# GEN-85 — in-game atlas QA

The atlas is integrated into the existing `ShipPanel` below the ship status and briefing. It uses the GEN-81 `drawPilgrimArkV2` renderer directly. Opening it is local UI state and does not write to the game state or save.

## Automated checks

- `npm run content:check` — PASS (16 files, 0 warnings)
- `npm run typecheck` — PASS
- `npm test` — see CI result in the pull request
- `npm run build` — PASS
- `git diff --check` — PASS

## Manual in-game checks

- RUN — Opened the real game at `/`, confirmed the atlas sits inside the existing right-side Ship panel and does not open automatically over a pending game decision.
- RUN — Opened overview: ship illustration, five named sector buttons, the home derived from current residence, and explicit unknown current location are visible.
- RUN — Opened `Жилой атриум A-6`; its canvas and three landmarks were visible.
- RUN — Returned to the overview, opened `Инженерный сектор B-4`; its distinct canvas and three landmarks were visible.
- RUN — Overview and sector views both show that placement is illustrative and exact location is unknown.
- RUN — Back and close controls remain native buttons; overview/sector control focus was observed in the browser accessibility tree.
- NOT RUN — System-level reduced-motion preference toggling and tab visibility suspension were not manually toggled; implementation listens for both browser signals. Static renderer behavior is covered by unit tests.
- NOT RUN — Save bytes were not compared before and after opening the atlas; the component only reads the store and maintains local Vue refs.

## Scope limits

The five schematics are illustrative pixel art, not a physical deck plan. Sector coordinates, adjacency, routes, room IDs, and current physical location are intentionally not represented or inferred. This prototype remains desktop-oriented as specified.
