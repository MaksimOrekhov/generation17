import type { Atmosphere } from './types'

/** Подставляется в флаги: при применении эффекта заменяется текущим возрастом героя. */
export const gYearPlaceholder = '__CURRENT_AGE__'

/** Уровень атмосферы для сравнения с `weird` у сюжетов, моментов и фоновых строк. */
export const ATMOSPHERE_LEVEL: Record<Atmosphere, number> = { calm: 0, mystery: 1, uncanny: 2 }
