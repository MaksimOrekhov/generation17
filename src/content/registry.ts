import bundle from './bundle.json'
import type { ContentBundle } from './types'

/** Unknown/removed categories remain displayable in historical content. */
export const categoryTitle = (id: string): string =>
  (bundle as ContentBundle).categories?.find(category => category.id === id)?.title ?? id
