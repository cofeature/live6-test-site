// Fails when a secret-shaped value appears in the project's content, assets
// manifest, export report or redirect stubs. Git history cannot be cleanly
// rewritten, so this is step zero of the first push (see OPERATIONS.md).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PATTERNS = [
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/],
  ['Supabase key', /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/],
  ['Supabase service role', /service_role/i],
  ['AWS access key id', /\b(AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['S3 secret key', /(secret[_-]?access[_-]?key|S3_SECRET_ACCESS_KEY)["'\s:=]+[A-Za-z0-9/+]{30,}/i],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  [
    'Secret assignment',
    /\b(PAYLOAD_SECRET|DATABASE_URL|S3_ACCESS_KEY_ID|GITHUB_CLIENT_SECRET)\s*[=:]\s*["']?[^\s"']{8,}/,
  ],
  [
    'Cloudflare or Pages CMS credential assignment',
    /\b(CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CF_API_TOKEN|CF_API_KEY|PAGES_?CMS_[A-Z_]*(TOKEN|SECRET|KEY)|PAGESCMS_[A-Z_]*(TOKEN|SECRET|KEY))\s*[=:]\s*["']?[^\s"']{8,}/i,
  ],
  ['Cloudflare API token header', /\bAuthorization["'\s:=]+Bearer\s+[A-Za-z0-9_-]{40,}/i],
  ['Connection string', /postgres(ql)?:\/\/[^\s:/@]+:[^\s@]+@/],
  ['Signed URL', /[?&](X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=/i],
  ['Private bucket URL', /\/storage\/v1\/object\/(sign|authenticated)\//],
]

/** @returns {{label: string, pattern: string}[]} */
export function scanText(text) {
  const hits = []
  for (const [label, re] of PATTERNS) if (re.test(text)) hits.push({ label, pattern: String(re) })
  return hits
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'out'])

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  const stat = fs.statSync(dir)
  if (stat.isFile()) {
    yield dir
    return
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    yield* walk(path.join(dir, entry.name))
  }
}

const TEXT_EXT = /\.(md|yaml|yml|json|html|txt|csv|xml|svg|ts|tsx|js|mjs|cjs|css|toml)$/i

/**
 * Scans the places exported content lives: content/, public/ (redirect stubs and
 * headers), asset-manifest.json, export-report.json and the redirect configs.
 * @returns {{file: string, label: string}[]}
 */
export function scanTree(root) {
  const targets = ['content', 'public', 'asset-manifest.json', 'export-report.json', 'vercel.json']
  const findings = []
  for (const t of targets) {
    for (const file of walk(path.join(root, t))) {
      if (!TEXT_EXT.test(file)) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const hit of scanText(text)) findings.push({ file: path.relative(root, file), label: hit.label })
    }
  }
  return findings
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.argv[2] ?? '.')
  const findings = scanTree(root)
  if (findings.length) {
    console.error('check:secrets FAILED — secret-shaped values found:')
    for (const f of findings) console.error(`  ${f.file}: ${f.label}`)
    process.exit(1)
  }
  console.log('check:secrets passed — no secret-shaped values in content, manifest, report or redirect stubs.')
}
