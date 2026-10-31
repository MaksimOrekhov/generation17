import { residenceOf, sectors } from '../domain/birth'
import type { GameState, SectorId } from '../domain/types'

export const SHIP_SECTOR_LANDMARKS: Record<SectorId, readonly string[]> = {
  atrium: ['Окна обзорной палубы', 'Зелёные галереи', 'Жилые проходы'],
  bio: ['Теплицы биокуполов', 'Аграрные галереи', 'Лотки семян и рассады'],
  engineering: ['Ремонтные посты', 'Узлы насосов', 'Места работы техслужб'],
  clinic: ['Тихие медицинские коридоры', 'Приёмные', 'Лабораторные столы'],
  lower: ['Общие кухни', 'Жилые проходы', 'Прачечная и вентиляция']
}

export const SHIP_ATLAS_UNKNOWN_LOCATION = 'Текущее местоположение неизвестно'
export const SHIP_ATLAS_OVERVIEW_NOTE = 'Сектора показаны для ознакомления; точное размещение не установлено.'
export const SHIP_ATLAS_DETAIL_NOTE = 'Схема условная; точное расположение не установлено.'

export function shipAtlasSectors(game: Pick<GameState, 'birth' | 'residence'>) {
  const home = residenceOf(game)
  return sectors.map(({ id, name, deck, blurb }) => ({ id, name, code: deck, blurb, landmarks: SHIP_SECTOR_LANDMARKS[id], isHome: id === home }))
}

export function shipAtlasSector(game: Pick<GameState, 'birth' | 'residence'>, id: SectorId) {
  return shipAtlasSectors(game).find(sector => sector.id === id)!
}
