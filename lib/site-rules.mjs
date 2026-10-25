// The rules for everything an editor can change, written once as plain functions. The pre-build check
// (scripts/check-site.mjs) and the site's own reader (lib/content.ts) both import this file, so the two
// cannot disagree. No file access happens here: callers pass in text, bytes and lookups.
import crypto from 'node:crypto'

import { Marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { isAlias, isMap, isScalar, isSeq, parseDocument, visit } from 'yaml'

import { cleanOptions, CONTROL_CHARS_RE, MAX_FRAGMENT_BYTES } from './clean-options.mjs'
import { allowedKeys, fields } from './fields.mjs'
import { detectKind, imageDimensions } from './photo-meta.mjs'

// --- the editable zone ----------------------------------------------------------------------

/** Folders an editor can write to. Must match the folders `.pages.yml` exposes (a test ties the two together). */
export const EDITABLE_FOLDERS = ['content/pages', 'content/posts', 'content/instructors', 'public/assets']
/** Single files an editor can write to. */
export const EDITABLE_FILES = ['content/site.yaml', 'content/studio.yaml']
export const COLLECTIONS = ['pages', 'posts', 'instructors']

/** Where a path sits: inside the editable zone, or protected (everything else). */
export function zoneOf(rel) {
  if (EDITABLE_FILES.includes(rel)) return 'file'
  for (const folder of EDITABLE_FOLDERS) if (rel === folder || rel.startsWith(folder + '/')) return folder
  return null
}

// --- limits (fixed in the tech design before any test) -----------------------------------------

export const LIMITS = {
  textFileBytes: 512 * 1024,
  lineLength: 64 * 1024,
  frontmatterBytes: 16 * 1024,
  yamlDepth: 6,
  listItems: 100,
  filesPerCollection: 2000,
  filesInZone: 5000,
  photoBytes: 10 * 1024 * 1024,
  photoSide: 10000,
  photoPixels: 40_000_000,
  photoCount: 2000,
  photoTotalBytes: 500 * 1024 * 1024,
  pdfBytes: 20 * 1024 * 1024,
  filenameBytes: 120,
  titleChars: 200,
  descriptionChars: 500,
  stringChars: 500,
  textChars: 2000,
}

const ASSET_EXT = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif', svg: 'svg', pdf: 'pdf' }

// --- text and names ------------------------------------------------------------------------------

// Bidirectional controls and isolates (Trojan Source), zero-width and invisible formatting characters.
// The characters themselves live in one string so the name, text and address rules cannot drift apart.
const HIDDEN_CHARS_SRC = '\\u061C\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2069\\uFEFF'
const HIDDEN_CHARS_RE = new RegExp(`[${HIDDEN_CHARS_SRC}]`)
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Decodes bytes as strict UTF-8. A single leading byte-order mark is allowed and removed. */
export function decodeUtf8(buf) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf)
    return { ok: true, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text }
  } catch {
    return { ok: false, problem: 'not valid UTF-8 text' }
  }
}

/** Problems with one file name or folder name (a single path segment). */
export function nameProblems(name) {
  const out = []
  if (!name) return ['empty name']
  if (Buffer.byteLength(name, 'utf8') > LIMITS.filenameBytes) out.push(`name longer than ${LIMITS.filenameBytes} bytes`)
  if (name.normalize('NFC') !== name) out.push('name is not in normalised (NFC) form')
  if (CONTROL_CHARS_RE.test(name) || /[\u0009\u000A\u000D\u0085\u2028\u2029]/.test(name)) out.push('name contains a control character')
  if (HIDDEN_CHARS_RE.test(name)) out.push('name contains a hidden or text-direction character')
  if (/[/\\:<>"|?*]/.test(name)) out.push('name contains a character that is not allowed (/ \\ : < > " | ? *)')
  if (name.startsWith('.')) out.push('name starts with a dot')
  if (/[. ]$/.test(name)) out.push('name ends with a dot or space')
  if (RESERVED_NAMES.test(name.split('.')[0])) out.push('name is reserved on Windows')
  return out
}

/** The key two names share when they would collide on a case-insensitive or look-alike file system. */
export const collisionKey = (name) => name.normalize('NFKC').toLowerCase()

/** Groups of paths that share a folder and a collision key (case twins, normalisation twins, look-alikes). */
export function collisionGroups(paths) {
  const seen = new Map()
  for (const p of paths) {
    const i = p.lastIndexOf('/')
    const key = `${p.slice(0, i + 1)}\0${collisionKey(p.slice(i + 1))}`
    seen.set(key, [...(seen.get(key) ?? []), p])
  }
  return [...seen.values()].filter((g) => g.length > 1)
}

/** Problems with the text of a file: size, characters, line length. `bytes` is the raw file size. */
export function textProblems(text, bytes) {
  const out = []
  if (bytes > LIMITS.textFileBytes) out.push(`file larger than ${LIMITS.textFileBytes / 1024} KiB`)
  if (text.includes('\uFEFF')) out.push('byte-order mark inside the file')
  if (CONTROL_CHARS_RE.test(text)) out.push('control character in the text')
  if (HIDDEN_CHARS_RE.test(text.replace(/\uFEFF/g, ''))) out.push('hidden or text-direction character in the text')
  for (const line of text.split('\n')) {
    if (line.length > LIMITS.lineLength) {
      out.push(`a line longer than ${LIMITS.lineLength / 1024} KiB`)
      break
    }
  }
  return out
}

// --- addresses ---------------------------------------------------------------------------------------

// Anything that is not a plain, visible address character is refused rather than "cleaned up".
// eslint-disable-next-line no-control-regex
const URL_BAD_RE = new RegExp(`[\\u0000-\\u0020\\u007F-\\u009F${HIDDEN_CHARS_SRC}\\u2028\\u2029\\u202F\\u206A-\\u206F\\\\]`)

/**
 * Why an address is not allowed, or null when it is. `kind` is 'link' (also allows `#section`, `mailto:`
 * and `tel:`) or 'image'. Full web addresses must name a host from `allowedHosts` (exact match, no
 * user name, no port); everything else must be a path on this site starting with exactly one `/`.
 */
export function urlProblem(raw, { allowedHosts, kind = 'link' }) {
  if (typeof raw !== 'string') return 'not text'
  if (raw.length > 2048) return 'longer than 2048 characters'
  if (URL_BAD_RE.test(raw)) return 'contains a space, control, hidden or backslash character'
  if (raw.startsWith('#')) return kind === 'link' ? null : 'an image cannot point at a page section'
  if (raw.startsWith('//')) return 'protocol-relative address (starts with //)'
  if (raw.startsWith('/')) return null
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)
  if (!scheme) return 'must start with / (a page on this site) or be a full web address'
  const name = scheme[1].toLowerCase()
  if ((name === 'mailto' || name === 'tel') && kind === 'link') return raw.length > name.length + 1 ? null : 'empty address'
  if (name !== 'http' && name !== 'https') return `the "${name}:" kind of address is not allowed`
  let url
  try {
    url = new URL(raw)
  } catch {
    return 'not a valid web address'
  }
  if (url.username || url.password) return 'contains a user name or password'
  if (url.port) return 'contains a port number'
  const hosts = allowedHosts instanceof Set ? allowedHosts : new Set(allowedHosts ?? [])
  if (!hosts.has(url.hostname)) return `the site ${url.hostname} is not on this site's list of allowed websites`
  return null
}

/** A photo reference: `/assets/...` under the photo folder, or a bare file name. */
export function assetRefProblem(value) {
  if (value.length > 512) return 'longer than 512 characters'
  if (URL_BAD_RE.test(value.replace(/ /g, '_'))) return 'contains a control, hidden or backslash character'
  const rel = value.startsWith('/assets/') ? value.slice('/assets/'.length) : value
  if (value.startsWith('/') && !value.startsWith('/assets/')) return 'must point into /assets/'
  if (!rel || rel.includes('//') || rel.split('/').some((s) => s === '.' || s === '..' || nameProblems(s).length)) return 'path is not allowed'
  if (!value.startsWith('/') && value.includes('/')) return 'must be /assets/... or a file name'
  return null
}

/** The `public/` path a photo reference resolves to. */
export const assetPathOf = (value) => `public/assets/${value.startsWith('/assets/') ? value.slice('/assets/'.length) : value}`

// --- YAML ------------------------------------------------------------------------------------------------

function depthOf(node) {
  if (isMap(node)) return 1 + Math.max(0, ...node.items.map((p) => depthOf(p.value)))
  if (isSeq(node)) return 1 + Math.max(0, ...node.items.map(depthOf))
  return 0
}

/**
 * Parses YAML strictly. Anchors, aliases, explicit tags, duplicate keys, non-text keys, deep nesting and
 * long lists are all refused. Returns `{ data }` or `{ problems }`.
 */
export function parseStrictYaml(text) {
  let doc
  try {
    doc = parseDocument(text, { uniqueKeys: true, maxAliasCount: 0, merge: false })
  } catch (e) {
    return { problems: [`YAML could not be read (${String(e?.message ?? e).split('\n')[0]})`] }
  }
  if (doc.errors.length) {
    const e = doc.errors[0]
    return { problems: [`YAML could not be read (${e.code}${e.linePos?.[0] ? `, line ${e.linePos[0].line}` : ''})`] }
  }
  const problems = new Set()
  visit(doc, {
    Alias() {
      problems.add('YAML alias (*name) is not allowed')
    },
    Node(_key, node) {
      if (isAlias(node)) return
      if (node.anchor) problems.add('YAML anchor (&name) is not allowed')
      if (node.tag) problems.add(`YAML tag (${node.tag}) is not allowed`)
    },
    Pair(_key, pair) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') problems.add('YAML key must be plain text')
    },
    Seq(_key, seq) {
      if (seq.items.length > LIMITS.listItems) problems.add(`list longer than ${LIMITS.listItems} items`)
    },
  })
  if (depthOf(doc.contents) > LIMITS.yamlDepth) problems.add(`YAML nested deeper than ${LIMITS.yamlDepth} levels`)
  if (problems.size) return { problems: [...problems] }
  return { data: doc.toJS({ maxAliasCount: 0 }) ?? {} }
}

/** Splits `---` frontmatter from the body. Same pattern the reader has always used. */
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text)
  if (!m) return { yaml: null, body: text }
  return { yaml: m[1], body: m[2].replace(/^\r?\n/, '') }
}

// --- field values -------------------------------------------------------------------------------------------

const ROUTE_RE = /^\/[a-z0-9/_.%-]*$/
const DATE_RE = /^[0-9TZ:.+\- ]{0,40}$/
const EMAIL_RE = /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[A-Za-z]{2,}$/
const PHONE_RE = /^[0-9+()\-. ]{0,40}$/
const SCALAR = (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v)
const str = (v) => (v == null ? '' : String(v))

const MAX_CHARS = { title: LIMITS.titleChars, seoTitle: LIMITS.titleChars, seoDescription: LIMITS.descriptionChars }

function valueProblem(def, value, ctx) {
  const { name, type } = def
  if (type === 'number') return value == null || (typeof value === 'number' && Number.isFinite(value)) ? null : 'must be a number'
  if (!SCALAR(value)) return 'must be plain text'
  const s = str(value)
  const max = MAX_CHARS[name] ?? (type === 'text' ? LIMITS.textChars : LIMITS.stringChars)
  if (s.length > max) return `longer than ${max} characters`
  if (!s) return null
  if (CONTROL_CHARS_RE.test(s) || HIDDEN_CHARS_RE.test(s)) return 'contains a control, hidden or text-direction character'
  if (name === 'route') {
    if (!ROUTE_RE.test(s) || s.includes('..') || s.includes('//') || /\/\.+$/.test(s)) return 'not a valid page address'
  } else if (name === 'heroImage' || name === 'photo') {
    const bad = assetRefProblem(s)
    if (bad) return bad
    if (ctx.assetExists && !ctx.assetExists(assetPathOf(s))) return 'no such photo in public/assets'
  } else if (name === 'bookingUrl' || name === 'href') {
    const bad = urlProblem(s, { allowedHosts: ctx.allowedHosts, kind: 'link' })
    if (bad) return bad
  } else if (name === 'canonicalBase') {
    const bad = /^https?:\/\//i.test(s) ? urlProblem(s, { allowedHosts: ctx.allowedHosts, kind: 'link' }) : 'must be a full web address'
    if (bad) return bad
  } else if (name === 'email') {
    if (!EMAIL_RE.test(s)) return 'not an email address'
  } else if (name === 'phone') {
    if (!PHONE_RE.test(s)) return 'a phone number may hold only digits and + ( ) - . and spaces'
  } else if (name === 'publishedAt' || name === 'createdAt' || name === 'updatedAt') {
    if (!DATE_RE.test(s)) return 'not a date'
  } else if (name === 'sourceUrl') {
    if (/[\u0000-\u001f\u007f<>"'\\\s]/.test(s)) return 'not a plain address'
  }
  return null
}

/** Checks a parsed object against a group in `fields.mjs`. `where` prefixes nested names. */
function checkObject(group, defs, data, ctx, out, where = '') {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    out.push(`${where || 'the file'} must be a set of named fields`)
    return
  }
  const allowed = new Map(defs.map((d) => [d.name, d]))
  for (const [key, value] of Object.entries(data)) {
    const def = allowed.get(key)
    const label = `${where}${key}`
    if (!def) {
      out.push(`unknown field "${label}" (allowed: ${[...allowed.keys()].join(', ')})`)
      continue
    }
    if (def.list) {
      if (value == null) continue
      if (!Array.isArray(value)) {
        out.push(`field "${label}" must be a list`)
        continue
      }
      if (value.length > LIMITS.listItems) out.push(`field "${label}" has more than ${LIMITS.listItems} items`)
      value.forEach((item, i) => {
        if (def.fields) checkObject(group, def.fields, item, ctx, out, `${label}[${i + 1}].`)
        else {
          const bad = valueProblem({ ...def, list: false }, item, ctx)
          if (bad) out.push(`field "${label}[${i + 1}]" ${bad}`)
        }
      })
      continue
    }
    const bad = valueProblem(def, value, ctx)
    if (bad) out.push(`field "${label}" ${bad}`)
  }
}

// --- bodies ------------------------------------------------------------------------------------------------------

/** The Markdown settings every reader of editable text uses (this file, the exporter, the renderer). */
export const MARKDOWN_OPTIONS = Object.freeze({ gfm: true })
const marked = new Marked({ ...MARKDOWN_OPTIONS })
const SITE_FENCE = /^site:([a-z-]+)$/
const defaultClean = (html) => sanitizeHtml(html, cleanOptions)

/**
 * Walks a Markdown body. Raw HTML outside a preserved block, an address that is not allowed, and a
 * preserved block that cleaning would change are all problems. Nothing is rewritten. `clean` is the
 * cleaner (the real one unless a test injects another).
 */
export function bodyProblems(body, ctx = {}) {
  const clean = ctx.clean ?? defaultClean
  const out = []
  let tokens
  try {
    tokens = marked.lexer(body ?? '')
  } catch (e) {
    return [`the text could not be read (${String(e?.message ?? e).split('\n')[0]})`]
  }
  let offset = 0
  for (const top of tokens) {
    const at = body.indexOf(top.raw, offset)
    const line = 1 + (body.slice(0, at < 0 ? offset : at).match(/\n/g)?.length ?? 0)
    if (at >= 0) offset = at + top.raw.length
    marked.walkTokens([top], (t) => {
      if (t.type === 'html') out.push(`raw HTML outside a preserved block (line ${line}); use ordinary Markdown`)
      else if (t.type === 'link' || t.type === 'image') {
        const bad = urlProblem(t.href, { allowedHosts: ctx.allowedHosts, kind: t.type })
        if (bad) out.push(`${t.type === 'image' ? 'image' : 'link'} address not allowed: ${bad} (line ${line})`)
      } else if (t.type === 'code') {
        const fence = SITE_FENCE.exec((t.lang ?? '').trim())
        if (fence?.[1] !== 'legacy-html') return
        const html = t.text
        if (html.length > MAX_FRAGMENT_BYTES || CONTROL_CHARS_RE.test(html)) {
          out.push(`preserved block cannot be cleaned safely: too big or has control characters (line ${line})`)
          return
        }
        try {
          if (clean(html) !== html) out.push(`preserved block (line ${line}) contains something cleaning would change; remove it or ask the operator`)
        } catch {
          out.push(`preserved block could not be cleaned (line ${line})`)
        }
      }
    })
  }
  return out
}

/** The address of every link and image in a Markdown body, as the renderer will see it (bare `www.` text included). */
export function bodyAddresses(body) {
  const out = []
  try {
    marked.walkTokens(marked.lexer(body ?? ''), (t) => {
      if ((t.type === 'link' || t.type === 'image') && typeof t.href === 'string') out.push(t.href)
    })
  } catch {
    /* an unreadable body is reported by bodyProblems */
  }
  return out
}

// --- whole files ---------------------------------------------------------------------------------------------------

/**
 * Every rule for one editable text file: Markdown with frontmatter in a content folder, or one of the two
 * settings files. Returns plain-English problems, none when the file fits. Fails closed: if a rule throws,
 * that is a problem.
 */
export function contentFileProblems(rel, buf, ctx = {}) {
  try {
    const decoded = decodeUtf8(buf)
    if (!decoded.ok) return [decoded.problem]
    const out = textProblems(decoded.text, buf.length)
    const yamlFile = rel.endsWith('.yaml')
    const group = yamlFile ? rel.slice('content/'.length, -'.yaml'.length) : rel.split('/')[1]
    const { yaml, body } = yamlFile ? { yaml: decoded.text, body: '' } : splitFrontmatter(decoded.text)
    if (yaml !== null) {
      if (Buffer.byteLength(yaml, 'utf8') > LIMITS.frontmatterBytes) out.push(`frontmatter larger than ${LIMITS.frontmatterBytes / 1024} KiB`)
      const parsed = parseStrictYaml(yaml)
      if (parsed.problems) out.push(...parsed.problems)
      else checkObject(group, (fields[group] ?? []), parsed.data, ctx, out)
    }
    if (!yamlFile) out.push(...bodyProblems(body, ctx))
    return out
  } catch (e) {
    return [`could not be checked, so it is refused (${String(e?.message ?? e).split('\n')[0]})`]
  }
}

/** Splits a content path into its collection (for per-collection limits), or undefined. */
export const collectionOf = (rel) => (rel.startsWith('content/') && COLLECTIONS.includes(rel.split('/')[1]) ? rel.split('/')[1] : undefined)

/** Problems with one file under `public/assets/`. `svgHashes` is the set of SVG hashes the export recorded. */
export function assetFileProblems(rel, buf, svgHashes = new Set()) {
  const name = rel.split('/').pop()
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase()
  const expect = ASSET_EXT[ext]
  if (!expect) return [`file type .${ext || '(none)'} is not allowed in the photo folder (jpg, png, webp, gif, pdf)`]
  if (expect === 'pdf') {
    const out = []
    if (buf.length > LIMITS.pdfBytes) out.push(`PDF larger than ${LIMITS.pdfBytes / 1024 / 1024} MiB`)
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') out.push('contents are not a PDF')
    return out
  }
  if (expect === 'svg') {
    const sha = crypto.createHash('sha256').update(buf).digest('hex')
    return svgHashes.has(sha) ? [] : ['SVG files can only be the ones exported with the site, and this one is not']
  }
  const out = []
  if (buf.length > LIMITS.photoBytes) out.push(`photo larger than ${LIMITS.photoBytes / 1024 / 1024} MiB`)
  const kind = detectKind(buf)
  if (kind !== expect) {
    out.push(`contents are not a ${expect.toUpperCase()} image (looks like ${kind === 'unknown' ? 'something else' : kind})`)
    return out
  }
  const size = imageDimensions(buf)
  if (!size || !size.width || !size.height) out.push('image size cannot be read from the file header')
  else if (size.width > LIMITS.photoSide || size.height > LIMITS.photoSide || size.width * size.height > LIMITS.photoPixels) {
    out.push(`image is ${size.width}×${size.height}; the limit is ${LIMITS.photoSide} pixels a side and ${LIMITS.photoPixels / 1e6} megapixels`)
  }
  return out
}

// --- the protected-path fingerprint ---------------------------------------------------------------------------------

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex')

/** Folders ignored at the project root, and generated files that are never in the repository. */
export const IGNORED_ROOT = ['node_modules', '.next', 'out', '.git', 'next-env.d.ts', 'tsconfig.tsbuildinfo']
export const isIgnored = (rel) => IGNORED_ROOT.includes(rel.split('/')[0]) || rel.split('/').pop() === '.DS_Store'

/** True for a path the fingerprint covers: not editable, not ignored. */
export const isProtected = (rel) => !zoneOf(rel) && !isIgnored(rel)

/** `{ path: sha256 }` for every protected file; `files` is `[{ path, bytes }]`. */
export function protectedHashes(files) {
  const out = {}
  for (const { path: p, bytes } of files) if (isProtected(p)) out[p] = sha256(typeof bytes === 'string' ? Buffer.from(bytes) : bytes)
  return out
}

/** One fingerprint over every protected file's path and contents. */
export function digestOf(hashes) {
  const h = crypto.createHash('sha256')
  for (const p of Object.keys(hashes).sort()) h.update(`${p}\0${hashes[p]}\n`)
  return h.digest('hex')
}

/** Protected files that differ from the recorded hashes: changed, added or removed. */
export function protectedDiff(recorded, actual) {
  const out = []
  for (const p of Object.keys(actual).sort()) {
    if (!(p in recorded)) out.push(`${p}: file added outside the editable folders`)
    else if (recorded[p] !== actual[p]) out.push(`${p}: protected file changed`)
  }
  for (const p of Object.keys(recorded).sort()) if (!(p in actual)) out.push(`${p}: protected file removed`)
  return out
}
