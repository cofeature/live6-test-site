// Proves the project stands alone: nothing in the built site or the repository's
// content, manifest, report or redirects points at the pipeline that produced it,
// and the build carries no editor.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { scanTree } from './check-secrets.mjs'

const FORBIDDEN = [
  ['pipeline host', /(localever|everbase|supabase)/i],
  ['media route', /\/api\/media/],
  ['admin route', /(?:^|["'(=\s])\/admin(?:[/"')\s]|$)/],
  ['pipeline source', /(src\/lift|src\/export|payload\.config|lift-output)/],
]
// The site has no editor and no second build. These names are assembled from parts so this file
// does not itself contain the words it forbids.
const EDITOR = ['key', 'static'].join('')
const SYNTAX = ['mark', 'doc'].join('')
const SHORT = ['m', 'doc'].join('')
const MODE = ['SITE', 'MODE'].join('_')
const EDITOR_IN_OUTPUT = [
  ['editor code or route', new RegExp(`(@${EDITOR}|${EDITOR}|${MODE}|makeRouteHandler)`, 'i')],
]

const TEXT = /\.(md|yaml|yml|json|html|txt|xml|svg|css|js|mjs|map|rsc)$/i

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  const stat = fs.statSync(dir)
  if (stat.isFile()) return yield dir
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) yield* walk(path.join(dir, e.name))
}

export function check(root) {
  const problems = []
  const scan = (target, rules, label) => {
    for (const file of walk(path.join(root, target))) {
      if (!TEXT.test(file)) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const [name, re] of rules) if (re.test(text)) problems.push(`${label} ${path.relative(root, file)}: ${name}`)
    }
  }
  for (const t of ['content', 'excluded', 'asset-manifest.json', 'export-report.json', 'review-report.json', 'vercel.json', 'site-check.json', 'public', 'README.md', 'OPERATIONS.md']) scan(t, FORBIDDEN, 'source')
  scan('out', [...FORBIDDEN, ...EDITOR_IN_OUTPUT], 'built site')
  for (const file of walk(path.join(root, 'out'))) {
    if (new RegExp(EDITOR, 'i').test(path.relative(root, file))) problems.push(`built site ${path.relative(root, file)}: editor file`)
  }
  // Content is plain Markdown: no template-tag syntax and no files in the old format.
  for (const file of walk(path.join(root, 'content'))) {
    if (new RegExp(`\\.(${SHORT}|${SYNTAX})$`, 'i').test(file)) problems.push(`source ${path.relative(root, file)}: old content format`)
    else if (/\.md$/i.test(file) && /(^|[^\\])\{%/.test(fs.readFileSync(file, 'utf8'))) problems.push(`source ${path.relative(root, file)}: template-tag syntax`)
  }
  // Reports and kept-but-unpublished content sit in the project; no build may carry them or the editor's request filter.
  for (const file of walk(path.join(root, 'out'))) {
    const rel = path.relative(path.join(root, 'out'), file).split(path.sep).join('/')
    if (/^(excluded\/|REVIEW\.md$|review-report\.json$|export-report\.json$|asset-manifest\.json$)/.test(rel) || /(^|\/)proxy[^/]*$/.test(rel)) {
      problems.push(`built site ${rel}: not for publishing`)
    }
  }
  if (!fs.existsSync(path.join(root, 'out'))) problems.push('no out/ folder: run `npm run build` first')
  for (const f of scanTree(root)) problems.push(`secret-shaped value in ${f.file}: ${f.label}`)
  return problems
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const problems = check(path.resolve(process.argv[2] ?? '.'))
  if (problems.length) {
    console.error('check:independence FAILED')
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }
  console.log('check:independence passed — no pipeline references, no editor in the build, no secrets.')
}
