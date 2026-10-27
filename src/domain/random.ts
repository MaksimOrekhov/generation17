/** Всё, что нужно генератору: хранимое состояние RNG. */
export interface Rng { rng: number }

// Детерминированный PRNG: состояние хранится в сохранении, Math.random() запрещён в движке
export function random(g: Rng): number {
  g.rng = (g.rng + 0x6D2B79F5) >>> 0
  let t = g.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function pick<T>(g: Rng, items: readonly T[]): T {
  return items[Math.floor(random(g) * items.length)]!
}

export function chance(g: Rng, probability: number) {
  return random(g) < probability
}

/** Выбор по весам из пар [значение, вес]. */
export function weighted<T>(g: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0)
  let roll = random(g) * total
  for (const [value, w] of items) {
    roll -= w
    if (roll < 0) return value
  }
  return items[items.length - 1]![0]
}

export function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n))
}

export function randomSeed() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]!
  }
  return Date.now() >>> 0
}

/** Чистый хэш (FNV-1a) для декоративных вещей, которые не должны расходовать RNG симуляции. */
export function hash32(...parts: (string | number)[]) {
  let h = 2166136261
  for (const c of parts.join('|')) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Автономный генератор по seed, не связанный с состоянием игры. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
