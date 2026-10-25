import fs from 'node:fs'
import path from 'node:path'

import { assetRefProblem, contentFileProblems, decodeUtf8, parseStrictYaml, splitFrontmatter } from './site-rules.mjs'

const cwd = () => process.cwd()
const root = () => path.join(cwd(), 'content')

type Dict = Record<string, unknown>

/** The websites an editor may link to, fixed by the export in site-check.json (not editable). Empty when absent. */
let hostsCache: { key: string; hosts: Set<string> } | undefined
export function allowedHosts(): Set<string> {
  const file = path.join(cwd(), 'site-check.json')
  try {
    // Read once per file version: the key changes whenever the file does, so an edit is never missed.
    const st = fs.statSync(file)
    const key = `${file}:${st.mtimeMs}:${st.size}`
    if (hostsCache?.key === key) return hostsCache.hosts
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as { allowedHosts?: unknown }
    const hosts = new Set(Array.isArray(cfg.allowedHosts) ? cfg.allowedHosts.filter((h): h is string => typeof h === 'string') : [])
    hostsCache = { key, hosts }
    return hosts
  } catch {
    return new Set()
  }
}

/**
 * Reads one editable file and holds it to every rule in site-rules.mjs at the moment it is read, so
 * nothing can change between the pre-build check and the render. A file that does not fit stops the
 * build, naming the file and the rule. Nothing is rewritten.
 */
function load(rel: string): { data: Dict; body: string } {
  const full = path.join(cwd(), rel)
  if (!fs.lstatSync(full).isFile()) throw new Error(`${rel}: not an ordinary file (symbolic links are not allowed)`)
  const buf = fs.readFileSync(full)
  const problems = contentFileProblems(rel, buf, {
    allowedHosts: allowedHosts(),
    assetExists: (p: string) => fs.existsSync(path.join(cwd(), p)),
  })
  if (problems.length) throw new Error(`${rel}: ${problems.join('; ')}`)
  const decoded = decodeUtf8(buf)
  const text = decoded.ok ? decoded.text : ''
  if (rel.endsWith('.yaml')) return { data: (parseStrictYaml(text).data ?? {}) as Dict, body: '' }
  const { yaml, body } = splitFrontmatter(text)
  return { data: (yaml === null ? {} : (parseStrictYaml(yaml).data ?? {})) as Dict, body }
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

function readFolder(group: 'pages' | 'posts' | 'instructors') {
  const dir = path.join(root(), group)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { data, body } = load(`content/${group}/${f}`)
      return { slug: f.slice(0, -3), data, body }
    })
}

function readSettings(name: 'site' | 'studio'): Dict {
  if (!fs.existsSync(path.join(root(), `${name}.yaml`))) return {}
  return load(`content/${name}.yaml`).data
}

type Link = { label: string; href: string }
const links = (v: unknown): Link[] => (Array.isArray(v) ? v.map((i) => ({ label: str((i as Dict).label), href: str((i as Dict).href) })) : [])

export async function getSite() {
  const d = readSettings('site')
  return { siteName: str(d.siteName), canonicalBase: str(d.canonicalBase), nav: links(d.nav), footer: links(d.footer) }
}

export async function getStudio() {
  const d = readSettings('studio')
  return { hours: str(d.hours), phone: str(d.phone), email: str(d.email), address: str(d.address), bookingUrl: str(d.bookingUrl) }
}

export async function getInstructors() {
  return readFolder('instructors')
    .map(({ slug, data, body }) => ({
      slug,
      entry: {
        name: str(data.name),
        role: str(data.role),
        credentials: str(data.credentials),
        photo: str(data.photo),
        photoAlt: str(data.photoAlt),
        order: typeof data.order === 'number' ? data.order : 100,
        bio: body,
      },
    }))
    .sort((a, b) => a.entry.order - b.entry.order || a.entry.name.localeCompare(b.entry.name))
}

export async function getPages() {
  return readFolder('pages')
    .map(({ slug, data, body }) => {
      const entry = {
        title: str(data.title),
        seoTitle: str(data.seoTitle),
        seoDescription: str(data.seoDescription),
        route: str(data.route),
        body,
      }
      return { slug, entry, route: normalize(entry.route || `/${slug}`) }
    })
    .sort((a, b) => a.route.localeCompare(b.route))
}

export async function getPosts() {
  return readFolder('posts')
    .map(({ slug, data, body }) => {
      const entry = {
        title: str(data.title),
        seoTitle: str(data.seoTitle),
        seoDescription: str(data.seoDescription),
        route: str(data.route),
        publishedAt: str(data.publishedAt),
        categories: Array.isArray(data.categories) ? data.categories.map(str) : [],
        heroImage: str(data.heroImage),
        body,
      }
      return {
        slug,
        entry,
        // An imported post keeps its original address even if its file name is later changed.
        route: normalize(entry.route || `/posts/${slug}`),
        date: entry.publishedAt,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
}

export function normalize(route: string) {
  return '/' + route.split('/').filter(Boolean).join('/')
}

/** A stored photo value is `/assets/...` or a bare file name; anything else is refused, not passed through. */
export function assetUrl(file: string | null | undefined) {
  if (!file) return ''
  if (assetRefProblem(file)) throw new Error(`photo path not allowed: ${file}`)
  // File names may hold characters (# % ?) that mean something in an address, so each part is encoded.
  const rel = file.startsWith('/') ? file.slice('/assets/'.length) : file
  return `/assets/${rel.split('/').map(encodeURIComponent).join('/')}`
}
