import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codeStorylets } from '../src/domain/storylets'
import { codeMoments } from '../src/domain/moments'
import { collectKnown, validateContent, type ContentFile, type Issue } from '../src/content/validate'

const root = fileURLToPath(new URL('..', import.meta.url))
const bundlePath = join(root, 'src/content/bundle.json')
const check = process.argv.includes('--check')

const files: ContentFile[] = []
const issues: Issue[] = []
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

issues.push(...validateContent(files, collectKnown(codeStorylets, codeMoments)))
const errors = issues.filter(i => i.level === 'error')
for (const i of issues) console.log(`${i.level === 'error' ? 'ОШИБКА' : 'внимание'}  ${i.where}\n          ${i.message}`)

const pack = (kind: 'storylets' | 'moments') => files.filter(f => f.kind === kind).flatMap(f => f.data as unknown[])
const bundle = JSON.stringify({ storylets: pack('storylets'), moments: pack('moments') }, null, 2) + '\n'

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
