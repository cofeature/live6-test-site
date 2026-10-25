// Checks a site folder before it is built: every file an editor could have touched is held to the
// rules in lib/site-rules.mjs, and everything an editor must not touch is fingerprinted.
//   node scripts/check-site.mjs .                 exits 1 with one line per problem
//   node scripts/check-site.mjs . --print-digest  prints the fingerprint of the protected files
// The expected fingerprint comes from the SITE_PROTECTED_DIGEST environment variable, set at the hosting
// project where an editor cannot reach it. Without it the check refuses to pass.
//
// This check is one layer, not a wall: anyone who can edit this script or package.json can remove it.
// The build also cleans every piece of editable content as it renders (lib/content.ts, lib/markdown.tsx).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assetFileProblems,
  collectionOf,
  collisionGroups,
  contentFileProblems,
  COLLECTIONS,
  digestOf,
  EDITABLE_FILES,
  EDITABLE_FOLDERS,
  isIgnored,
  LIMITS,
  nameProblems,
  protectedDiff,
  protectedHashes,
  zoneOf,
} from '../lib/site-rules.mjs'
import { pagesConfigProblems } from '../lib/synthetic.mjs'

export const DIGEST_ENV = 'SITE_PROTECTED_DIGEST'

/** Every file and folder under `root` (symlinks reported, never followed), as `{ rel, kind, size }`. */
function walk(root) {
  const out = []
  const visit = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (!rel && ['node_modules', '.next', 'out', '.git'].includes(e.name)) continue
      if (e.name === '.DS_Store' && e.isFile()) continue // Finder litter, never content
      const full = path.join(dir, e.name)
      if (e.isSymbolicLink()) out.push({ rel: r, kind: 'symlink' })
      else if (e.isDirectory()) {
        out.push({ rel: r, kind: 'dir' })
        visit(full, r)
      } else if (e.isFile()) out.push({ rel: r, kind: 'file', size: fs.statSync(full).size })
      else out.push({ rel: r, kind: 'other' })
    }
  }
  visit(root, '')
  return out
}

function readConfig(root, problems) {
  const file = path.join(root, 'site-check.json')
  let cfg
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    problems.push('site-check.json: missing or unreadable; this file is written by the export and must not be removed')
    return undefined
  }
  const hosts = cfg?.allowedHosts
  if (!Array.isArray(hosts) || hosts.some((h) => typeof h !== 'string' || !/^[a-z0-9.-]+$/.test(h))) {
    problems.push('site-check.json: allowedHosts must be a list of lower-case host names')
    return undefined
  }
  const editable = [...EDITABLE_FOLDERS, ...EDITABLE_FILES]
  if (JSON.stringify(cfg.editable) !== JSON.stringify(editable)) problems.push('site-check.json: the editable folder list does not match this check')
  return cfg
}

/** Protected files with their bytes, for hashing. */
function protectedFiles(root, entries) {
  return entries
    .filter((e) => e.kind === 'file' && !zoneOf(e.rel) && !isIgnored(e.rel))
    .map((e) => ({ path: e.rel, bytes: fs.readFileSync(path.join(root, e.rel)) }))
}

/**
 * Runs every rule and returns the list of problems (empty when the site passes).
 * `opts.clean` lets a test inject a different cleaner; `opts.env` defaults to `process.env`.
 */
export function checkSite(root, opts = {}) {
  const env = opts.env ?? process.env
  const problems = []
  const cfg = readConfig(root, problems)
  const entries = walk(root)

  // 1. Kinds of thing in the tree.
  for (const e of entries) {
    if (isIgnored(e.rel)) continue
    if (e.kind === 'symlink') problems.push(`${e.rel}: symbolic links are not allowed`)
    else if (e.kind === 'other') problems.push(`${e.rel}: not an ordinary file or folder`)
  }

  // 2. The editable zone.
  const zone = entries.filter((e) => zoneOf(e.rel) && (e.kind === 'file' || e.kind === 'dir'))
  const zoneFiles = zone.filter((e) => e.kind === 'file')
  if (zoneFiles.length > LIMITS.filesInZone) problems.push(`editable folders hold ${zoneFiles.length} files; the limit is ${LIMITS.filesInZone}`)
  for (const c of COLLECTIONS) {
    const n = zoneFiles.filter((e) => collectionOf(e.rel) === c).length
    if (n > LIMITS.filesPerCollection) problems.push(`content/${c}: ${n} files; the limit is ${LIMITS.filesPerCollection}`)
  }
  const photoFiles = zoneFiles.filter((e) => e.rel.startsWith('public/assets/'))
  if (photoFiles.length > LIMITS.photoCount) problems.push(`public/assets: ${photoFiles.length} files; the limit is ${LIMITS.photoCount}`)
  const photoBytes = photoFiles.reduce((n, e) => n + (e.size ?? 0), 0)
  if (photoBytes > LIMITS.photoTotalBytes) problems.push(`public/assets: ${(photoBytes / 1024 / 1024).toFixed(0)} MiB in total; the limit is ${LIMITS.photoTotalBytes / 1024 / 1024} MiB`)

  // Names and folder-level collisions (case, normalisation, look-alikes).
  for (const e of zone) {
    const segs = e.rel.split('/')
    const editableDepth = EDITABLE_FOLDERS.find((f) => e.rel.startsWith(f + '/'))?.split('/').length ?? segs.length - 1
    for (const seg of segs.slice(editableDepth)) for (const p of nameProblems(seg)) problems.push(`${e.rel}: ${p}`)
  }
  for (const group of collisionGroups(zone.map((e) => e.rel))) {
    for (const rel of group) problems.push(`${rel}: name collides with ${group.filter((g) => g !== rel).join(', ')} (names are compared ignoring case and look-alike forms)`)
  }

  // Which exported SVGs are trusted: the export recorded their hashes in asset-manifest.json.
  let svgHashes = new Set()
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-manifest.json'), 'utf8'))
    svgHashes = new Set((manifest.assets ?? []).map((a) => a.sha256).filter(Boolean))
  } catch {
    /* no manifest: no SVG is trusted */
  }

  const ctx = {
    allowedHosts: new Set(cfg?.allowedHosts ?? []),
    assetExists: (rel) => fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isFile(),
    clean: opts.clean,
  }
  for (const e of zone) {
    if (e.kind === 'dir') {
      // Folders are allowed inside the photo folder only.
      const inCollection = COLLECTIONS.some((c) => e.rel.startsWith(`content/${c}/`))
      if (inCollection) problems.push(`${e.rel}: subfolders are not allowed here`)
      continue
    }
    const isContent = e.rel.startsWith('content/')
    if (isContent) {
      const okName = EDITABLE_FILES.includes(e.rel) || (COLLECTIONS.includes(e.rel.split('/')[1]) && e.rel.split('/').length === 3 && e.rel.endsWith('.md'))
      if (!okName) {
        problems.push(`${e.rel}: only .md files directly inside the page, post and instructor folders are allowed`)
        continue
      }
      if (e.size > LIMITS.textFileBytes) problems.push(`${e.rel}: file larger than ${LIMITS.textFileBytes / 1024} KiB`)
      else for (const p of contentFileProblems(e.rel, fs.readFileSync(path.join(root, e.rel)), ctx)) problems.push(`${e.rel}: ${p}`)
    } else {
      const pdf = e.rel.toLowerCase().endsWith('.pdf')
      const cap = pdf ? LIMITS.pdfBytes : LIMITS.photoBytes
      // Over the limit is reported from the size alone, so a huge file is never loaded into memory.
      if (e.size > cap) problems.push(`${e.rel}: ${pdf ? 'PDF' : 'photo'} larger than ${cap / 1024 / 1024} MiB`)
      else for (const p of assetFileProblems(e.rel, fs.readFileSync(path.join(root, e.rel)), svgHashes)) problems.push(`${e.rel}: ${p}`)
    }
  }

  // Pages CMS settings file: present only if the export produced it for verified made-up data.
  if (entries.some((e) => e.rel === '.pages.yml')) {
    for (const p of pagesConfigProblems(fs.readFileSync(path.join(root, '.pages.yml')), cfg?.pagesConfig)) problems.push(p)
  }

  // 3. The protected files: nothing outside the editable zone may differ from the export.
  const expected = env[DIGEST_ENV]
  const hashes = protectedHashes(protectedFiles(root, entries))
  const actual = digestOf(hashes)
  if (!expected) {
    problems.push(`${DIGEST_ENV} is not set: set it in the hosting project to the value printed by \`npm run check:site -- --print-digest\` on a trusted copy. The check refuses to pass without it.`)
  } else if (expected !== actual) {
    const { 'site-check.json': _own, ...others } = hashes
    const detail = cfg?.protected ? protectedDiff(cfg.protected, others) : []
    problems.push(`protected files differ from the trusted copy (${DIGEST_ENV} does not match)`)
    for (const d of detail) problems.push(d)
  }
  return problems
}

/** The fingerprint of the protected files in `root`, for the operator to store at the hosting project. */
export function printableDigest(root) {
  return digestOf(protectedHashes(protectedFiles(root, walk(root))))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.')
  if (args.includes('--print-digest')) {
    console.log(printableDigest(root))
    process.exit(0)
  }
  let problems
  try {
    problems = checkSite(root)
  } catch (e) {
    problems = [`the check could not finish, so the build is stopped (${String(e?.message ?? e).split('\n')[0]})`]
  }
  if (problems.length) {
    console.error('check:site FAILED — the build was stopped before it started. Nothing was published.')
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }
  console.log('check:site passed.')
}
