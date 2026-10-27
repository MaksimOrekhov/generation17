import type { Season, SectorId, SpotId } from '../domain/types'
import type { Ctx } from './draw'
import { cabinScene } from './cabin'

export const SCENE_W = 480
export const SCENE_H = 270

/** Всё, что сцене нужно знать о состоянии игры. Сцена ничего не меняет и не читает хранилище. */
export interface SceneModel {
  name: string
  age: number
  wealth: number
  sectorId: SectorId
  season: Season
  /** Доля текущего года, 0…1 — для плавной смены света. */
  progress: number
  companion: { name: string; age: number; kind: 'parent' | 'partner' } | null
  /** Объект, который сейчас подсвечивается (активный момент). */
  spot: SpotId | null
}

export interface SceneRenderer {
  id: string
  /** `t` — секунды анимации. Рисует кадр целиком. */
  draw(ctx: Ctx, t: number, model: SceneModel): void
}

/** Сейчас одна сцена — каюта. Школа, мастерская и биокупол добавятся здесь, без изменений в компоненте. */
export function pickScene(_model: SceneModel): SceneRenderer {
  return cabinScene
}
