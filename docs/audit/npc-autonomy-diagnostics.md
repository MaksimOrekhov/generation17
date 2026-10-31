# GEN-57 — диагностические симуляции автономии NPC

Фиксированный прогон по GEN-52: golden seeds `17, 29, 43, 58, 73, 101, 137, 211` выполнены в двух политиках; `1000..1023` — одна responsive политика. Прогон детерминирован для одинакового кода и seed. Это синтетическая диагностика, не оценка живой аудитории.

**Политики:** `passive` выбирает бесплатный `no-contact` в двух новых сценах и первый допустимый ответ в остальных сюжетах; `responsive` выбирает первый контактный ответ (`ask-work` / `ask-routine`) и первый допустимый ответ в остальных сюжетах. Обязательные решения не оставляются открытыми.

## Разделённые счётчики по cohort

| Cohort / policy | Runs | eligibleNPC | E_job | T_job | T_job/E_job | E_move | T_move | T_move/E_move | Public records / T | State renderable / T | Scene windows R_eligible | Offered O | Contact played R | No-contact | NOT_EXPOSED | Censored runs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Golden · passive | 8 | 13 | 13 | 13 | 13/13 (100.0%) | 0 | 0 | N/A | 13/13 | 13/13 | 13 | 5 | 0 | 5 | 8 | 0 |
| Golden · responsive | 8 | 13 | 13 | 13 | 13/13 (100.0%) | 0 | 0 | N/A | 13/13 | 13/13 | 13 | 5 | 5 | 0 | 8 | 0 |
| 1000..1023 · responsive | 24 | 42 | 42 | 42 | 42/42 (100.0%) | 0 | 0 | N/A | 42/42 | 42/42 | 42 | 10 | 10 | 0 | 32 | 0 |

`eligibleNPC` — уникальные реальные `friend`/`sibling` с хотя бы одним достигнутым безопасным окном. `E_job` и `E_move` — уникальные пары run/person/kind; при `E_move=0` процент — `N/A`. `O` — фактический pending storylet. `R` — реально сыгранный контакт; отказ считается отдельно и не приписывается как контакт. `NOT_EXPOSED` — доступное окно, в котором director не предложил сцену. `Public records` означает созданную factual запись; `State renderable` — текущая профессия/сектор присутствуют в модели и отображаются существующей FamilyPanel. Это proxy, не доказательство, что игрок прочёл запись; `actuallySeen=UNKNOWN`.

## Фактически применённые переходы и доступные факты

| Cohort | Seed | Policy | NPC | Event | NPC age | Hero age | Ship year | Public log | Current state renderable |
|---|---:|---|---|---|---:|---:|---:|---|---|
| Golden · passive | 17 | passive | friend | firstJob | 18 | 18 | 208 | #34 | yes |
| Golden · passive | 29 | passive | sibling | firstJob | 21 | 14 | 204 | #25 | yes |
| Golden · passive | 29 | passive | friend | firstJob | 19 | 19 | 209 | #36 | yes |
| Golden · passive | 43 | passive | friend | firstJob | 16 | 16 | 206 | #29 | yes |
| Golden · passive | 43 | passive | sibling | firstJob | 18 | 16 | 206 | #30 | yes |
| Golden · passive | 58 | passive | friend | firstJob | 21 | 21 | 211 | #41 | yes |
| Golden · passive | 73 | passive | sibling | firstJob | 19 | 14 | 204 | #25 | yes |
| Golden · passive | 73 | passive | friend | firstJob | 18 | 18 | 208 | #35 | yes |
| Golden · passive | 101 | passive | sibling | firstJob | 22 | 13 | 203 | #21 | yes |
| Golden · passive | 101 | passive | friend | firstJob | 20 | 20 | 210 | #38 | yes |
| Golden · passive | 137 | passive | friend | firstJob | 16 | 16 | 206 | #29 | yes |
| Golden · passive | 211 | passive | friend | firstJob | 18 | 18 | 208 | #32 | yes |
| Golden · passive | 211 | passive | sibling | firstJob | 21 | 18 | 208 | #33 | yes |
| Golden · responsive | 17 | responsive | friend | firstJob | 18 | 18 | 208 | #34 | yes |
| Golden · responsive | 29 | responsive | sibling | firstJob | 21 | 14 | 204 | #25 | yes |
| Golden · responsive | 29 | responsive | friend | firstJob | 19 | 19 | 209 | #36 | yes |
| Golden · responsive | 43 | responsive | friend | firstJob | 16 | 16 | 206 | #29 | yes |
| Golden · responsive | 43 | responsive | sibling | firstJob | 18 | 16 | 206 | #30 | yes |
| Golden · responsive | 58 | responsive | friend | firstJob | 21 | 21 | 211 | #41 | yes |
| Golden · responsive | 73 | responsive | sibling | firstJob | 19 | 14 | 204 | #25 | yes |
| Golden · responsive | 73 | responsive | friend | firstJob | 18 | 18 | 208 | #35 | yes |
| Golden · responsive | 101 | responsive | sibling | firstJob | 22 | 13 | 203 | #21 | yes |
| Golden · responsive | 101 | responsive | friend | firstJob | 20 | 20 | 210 | #38 | yes |
| Golden · responsive | 137 | responsive | friend | firstJob | 16 | 16 | 206 | #29 | yes |
| Golden · responsive | 211 | responsive | friend | firstJob | 18 | 18 | 208 | #32 | yes |
| Golden · responsive | 211 | responsive | sibling | firstJob | 21 | 18 | 208 | #33 | yes |
| 1000..1023 · responsive | 1000 | responsive | sibling | firstJob | 19 | 13 | 203 | #25 | yes |
| 1000..1023 · responsive | 1000 | responsive | friend | firstJob | 19 | 19 | 209 | #38 | yes |
| 1000..1023 · responsive | 1001 | responsive | sibling | firstJob | 21 | 15 | 205 | #28 | yes |
| 1000..1023 · responsive | 1001 | responsive | friend | firstJob | 18 | 18 | 208 | #37 | yes |
| 1000..1023 · responsive | 1002 | responsive | friend | firstJob | 20 | 20 | 210 | #38 | yes |
| 1000..1023 · responsive | 1003 | responsive | sibling | firstJob | 18 | 15 | 205 | #28 | yes |
| 1000..1023 · responsive | 1003 | responsive | friend | firstJob | 18 | 18 | 208 | #35 | yes |
| 1000..1023 · responsive | 1004 | responsive | sibling | firstJob | 17 | 13 | 203 | #25 | yes |
| 1000..1023 · responsive | 1004 | responsive | friend | firstJob | 16 | 16 | 206 | #32 | yes |
| 1000..1023 · responsive | 1005 | responsive | friend | firstJob | 19 | 19 | 209 | #37 | yes |
| 1000..1023 · responsive | 1006 | responsive | sibling | firstJob | 20 | 13 | 203 | #23 | yes |
| 1000..1023 · responsive | 1006 | responsive | friend | firstJob | 22 | 22 | 212 | #42 | yes |
| 1000..1023 · responsive | 1007 | responsive | sibling | firstJob | 20 | 12 | 202 | #20 | yes |
| 1000..1023 · responsive | 1007 | responsive | friend | firstJob | 19 | 19 | 209 | #34 | yes |
| 1000..1023 · responsive | 1008 | responsive | sibling | firstJob | 18 | 16 | 206 | #27 | yes |
| 1000..1023 · responsive | 1008 | responsive | friend | firstJob | 20 | 20 | 210 | #37 | yes |
| 1000..1023 · responsive | 1009 | responsive | friend | firstJob | 21 | 21 | 211 | #42 | yes |
| 1000..1023 · responsive | 1010 | responsive | sibling | firstJob | 17 | 10 | 200 | #18 | yes |
| 1000..1023 · responsive | 1010 | responsive | friend | firstJob | 22 | 22 | 212 | #45 | yes |
| 1000..1023 · responsive | 1011 | responsive | sibling | firstJob | 18 | 15 | 205 | #26 | yes |
| 1000..1023 · responsive | 1011 | responsive | friend | firstJob | 16 | 16 | 206 | #28 | yes |
| 1000..1023 · responsive | 1012 | responsive | friend | firstJob | 16 | 16 | 206 | #27 | yes |
| 1000..1023 · responsive | 1012 | responsive | sibling | firstJob | 22 | 20 | 210 | #38 | yes |
| 1000..1023 · responsive | 1014 | responsive | sibling | firstJob | 18 | 9 | 199 | #17 | yes |
| 1000..1023 · responsive | 1014 | responsive | friend | firstJob | 22 | 22 | 212 | #43 | yes |
| 1000..1023 · responsive | 1015 | responsive | sibling | firstJob | 17 | 11 | 201 | #21 | yes |
| 1000..1023 · responsive | 1015 | responsive | friend | firstJob | 20 | 20 | 210 | #39 | yes |
| 1000..1023 · responsive | 1016 | responsive | sibling | firstJob | 17 | 14 | 204 | #27 | yes |
| 1000..1023 · responsive | 1016 | responsive | friend | firstJob | 21 | 21 | 211 | #43 | yes |
| 1000..1023 · responsive | 1017 | responsive | sibling | firstJob | 22 | 18 | 208 | #36 | yes |
| 1000..1023 · responsive | 1017 | responsive | friend | firstJob | 22 | 22 | 212 | #44 | yes |
| 1000..1023 · responsive | 1018 | responsive | sibling | firstJob | 19 | 10 | 200 | #20 | yes |
| 1000..1023 · responsive | 1018 | responsive | friend | firstJob | 19 | 19 | 209 | #38 | yes |
| 1000..1023 · responsive | 1019 | responsive | friend | firstJob | 19 | 19 | 209 | #35 | yes |
| 1000..1023 · responsive | 1020 | responsive | sibling | firstJob | 18 | 10 | 200 | #18 | yes |
| 1000..1023 · responsive | 1020 | responsive | friend | firstJob | 22 | 22 | 212 | #43 | yes |
| 1000..1023 · responsive | 1021 | responsive | sibling | firstJob | 21 | 12 | 202 | #22 | yes |
| 1000..1023 · responsive | 1021 | responsive | friend | firstJob | 21 | 21 | 211 | #42 | yes |
| 1000..1023 · responsive | 1022 | responsive | sibling | firstJob | 17 | 11 | 201 | #21 | yes |
| 1000..1023 · responsive | 1022 | responsive | friend | firstJob | 21 | 21 | 211 | #43 | yes |
| 1000..1023 · responsive | 1023 | responsive | sibling | firstJob | 21 | 16 | 206 | #29 | yes |
| 1000..1023 · responsive | 1023 | responsive | friend | firstJob | 21 | 21 | 211 | #39 | yes |

## Предложенные сцены и выбранный ответ

| Cohort | Seed | Предложенная сцена | Ответ |
|---|---:|---|---|
| Golden · passive | 17 | npc-friend-shift-ledger | no-contact |
| Golden · passive | 29 | npc-sibling-own-rhythm | no-contact |
| Golden · passive | 43 | npc-sibling-own-rhythm | no-contact |
| Golden · passive | 101 | npc-sibling-own-rhythm | no-contact |
| Golden · passive | 101 | npc-friend-shift-ledger | no-contact |
| Golden · responsive | 17 | npc-friend-shift-ledger | ask-work |
| Golden · responsive | 29 | npc-sibling-own-rhythm | ask-routine |
| Golden · responsive | 43 | npc-sibling-own-rhythm | ask-routine |
| Golden · responsive | 101 | npc-sibling-own-rhythm | ask-routine |
| Golden · responsive | 101 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1001 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1003 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1007 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1008 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1010 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1015 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1016 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1018 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1022 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1023 | npc-sibling-own-rhythm | ask-routine |

## Фактически сыгранные разговоры

| Cohort | Seed | Storylet | Contact choice |
|---|---:|---|---|
| Golden · responsive | 17 | npc-friend-shift-ledger | ask-work |
| Golden · responsive | 29 | npc-sibling-own-rhythm | ask-routine |
| Golden · responsive | 43 | npc-sibling-own-rhythm | ask-routine |
| Golden · responsive | 101 | npc-sibling-own-rhythm | ask-routine |
| Golden · responsive | 101 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1001 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1003 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1007 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1008 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1010 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1015 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1016 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1018 | npc-sibling-own-rhythm | ask-routine |
| 1000..1023 · responsive | 1022 | npc-friend-shift-ledger | ask-work |
| 1000..1023 · responsive | 1023 | npc-sibling-own-rhythm | ask-routine |

## Причины пропуска на достигнутых плановых возрастах

| NPC:event:reason | Runs |
|---|---:|
| friend:firstMove:UNKNOWN_SOURCE | 39 |
| sibling:firstJob:ABSENT | 11 |
| sibling:firstMove:ABSENT | 11 |
| sibling:firstMove:UNKNOWN_SOURCE | 29 |

## Цензурированные прогоны

| Cohort | Seed |
|---|---|
| Golden · passive | — |
| Golden · responsive | — |
| 1000..1023 · responsive | — |

## Ограничения интерпретации

- В fresh lives друг и sibling не имеют исходного `state.sectorId`. Для них переезд корректно пропускается с `UNKNOWN_SOURCE`; synthetic cohort не используется для создания адреса. Ноль переездов при `E_move=0` — `N/A`, не провал порога.
- Сцена может быть eligible, но не предложена director; JSON eligibility не считается предложением. Личный разговор считается только после выбора контактного choice ID. `no-contact` не добавляет memory.
- Public log and current FamilyPanel state are technical presentation proxies. Браузерный smoke, фактическое прочтение записи и человеческий playtest в этом диагностическом CLI не выполнялись.
- Смерть героя или невозможность разрешить pending decision до hero age 40 помечается как censored; недостигнутые окна не добавляются в знаменатели.
