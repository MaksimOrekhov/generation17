import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codeStorylets } from '../src/domain/storylets'
import { codeMoments } from '../src/domain/moments'
import { collectKnown, validateContent, type ContentFile, type Issue, validateRegistrations } from '../src/content/validate'

const root = fileURLToPath(new URL('..', import.meta.url))
const bundlePath = join(root, 'src/content/bundle.json')
const check = process.argv.includes('--check')
const lines = JSON.parse(readFileSync(join(root, 'content/lines.json'), 'utf8'))
const categories = JSON.parse(readFileSync(join(root, 'content/categories.json'), 'utf8'))

const files: ContentFile[] = []
const issues: Issue[] = []
const slots: unknown = JSON.parse(readFileSync(join(root, 'content/people.json'), 'utf8'))
const roles: unknown = JSON.parse(readFileSync(join(root, 'content/person-roles.json'), 'utf8'))
if (!roles || typeof roles !== 'object' || Array.isArray(roles) || !Object.keys(roles).length) issues.push({ level: 'error', where: 'content/person-roles.json', message: 'нужна непустая карта ролей' })
else for (const [id, label] of Object.entries(roles)) {
  if (!/^[a-z][a-z0-9]*$/.test(id) || typeof label !== 'string' || !label.trim() || label !== label.trim() || label.length > 40) issues.push({ level: 'error', where: 'content/person-roles.json', message: `некорректная роль: ${id}` })
}
const reserved = new Set(['parent', 'parent2', 'sibling', 'friend', 'neighbor', 'mentor', 'child', 'partner', 'formerPartner', 'hero', 'name', 'job'])
if (!Array.isArray(slots)) issues.push({ level: 'error', where: 'content/people.json', message: 'нужен массив объявлений слотов' })
else {
  const seen = new Set<string>()
  for (const slot of slots) {
    const id = slot && typeof slot === 'object' && !Array.isArray(slot) ? (slot as Record<string, unknown>).id : undefined
    if (typeof id !== 'string' || !/^[a-z][a-z0-9]*$/.test(id) || reserved.has(id) || seen.has(id) || Object.keys(slot).some(key => key !== 'id')) issues.push({ level: 'error', where: 'content/people.json', message: `некорректный или повторный слот: ${String(id)}` })
    else seen.add(id)
  }
}
for (const kind of ['storylets', 'moments'] as const) {
  const dir = join(root, 'content', kind)
  if (!existsSync(dir)) continue
  for (const name of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const path = relative(root, join(dir, name)).split(sep).join('/')
    try {
      files.push({ path, kind, data: JSON.parse(readFileSync(join(dir, name), 'utf8')) })
    } catch (e) {
      issues.push({ level: 'error', where: path, message: `невалидный JSON: ${(e as Error).message}` })
    }
  }
}

const known = collectKnown(codeStorylets, codeMoments)
issues.push(...validateRegistrations(lines, categories, files, known))
issues.push(...validateContent(files, known))
const errors = issues.filter(i => i.level === 'error')
for (const i of issues) console.log(`${i.level === 'error' ? 'ОШИБКА' : 'внимание'}  ${i.where}\n          ${i.message}`)

const pack = (kind: 'storylets' | 'moments') => files.filter(f => f.kind === kind).flatMap(f => f.data as unknown[])
const bundle = JSON.stringify({ lines, categories, storylets: pack('storylets'), moments: pack('moments') }, null, 2) + '\n'

if (errors.length) {
  console.log(`\nОшибок: ${errors.length}. Бандл не обновлён.`)
  process.exit(1)
}
const current = existsSync(bundlePath) ? readFileSync(bundlePath, 'utf8') : ''
if (check) {
  if (current !== bundle) {
    console.log('\nsrc/content/bundle.json устарел: запустите npm run content')
    process.exit(1)
  }
  console.log(`\nOK: ${files.length} файлов, предупреждений: ${issues.length}`)
} else {
  if (current !== bundle) writeFileSync(bundlePath, bundle)
  const b = JSON.parse(bundle)
  console.log(`\nГотово: сюжетов ${b.storylets.length}, моментов ${b.moments.length}, предупреждений ${issues.length}. Бандл ${current !== bundle ? 'обновлён' : 'актуален'}.`)
}
