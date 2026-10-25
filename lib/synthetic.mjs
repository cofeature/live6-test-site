// What makes a data set "made-up test data", shared by the exporter and this site's own check.
// Pure: no file access. The exporter verifies a fixture folder against SYNTHETIC_FIXTURE_DIGEST before it
// writes a Pages CMS settings file, and stamps that file with the digest; the check refuses an unstamped one.
import crypto from 'node:crypto'

/**
 * The digest of the committed test data's marker and manifest. Changing the test data means running
 * `scripts/mark-synthetic-fixture.ts` and pasting its output here, so the edit shows up in review.
 */
export const SYNTHETIC_FIXTURE_DIGEST = '5034744fc395409869e0790ac02a1a4608855e2f6a706ab9d1b2f08a6e1218d7'

/** First characters of the first line of a stamped `.pages.yml`; the digest follows. */
export const PAGES_CONFIG_STAMP_PREFIX = '# everbase-sites synthetic-fixture '

/** sha256 over the marker and the manifest bytes, kept apart so neither can stand in for the other. */
export function fixtureDigest(markerBytes, manifestBytes) {
  return crypto
    .createHash('sha256')
    .update('marker\0')
    .update(markerBytes)
    .update('\0manifest\0')
    .update(manifestBytes)
    .digest('hex')
}

/** The digest a `.pages.yml` claims in its first line, or undefined when it has no stamp. */
export function stampOf(yamlText) {
  const first = String(yamlText).split('\n', 1)[0] ?? ''
  if (!first.startsWith(PAGES_CONFIG_STAMP_PREFIX)) return undefined
  return first.slice(PAGES_CONFIG_STAMP_PREFIX.length).trim()
}

/** Problems with a settings file's stamp and its record in site-check.json (empty when it is genuine). */
export function pagesConfigProblems(yamlBytes, record) {
  const text = Buffer.isBuffer(yamlBytes) ? yamlBytes.toString('utf8') : String(yamlBytes)
  const message = 'Pages CMS settings file was not produced for a verified made-up export'
  const stamp = stampOf(text)
  if (!stamp) return [`.pages.yml: ${message} (no stamp)`]
  if (stamp !== SYNTHETIC_FIXTURE_DIGEST) return [`.pages.yml: ${message} (stamp does not match)`]
  const sha = crypto.createHash('sha256').update(text).digest('hex')
  if (!record || record.fixtureDigest !== SYNTHETIC_FIXTURE_DIGEST || record.sha256 !== sha) return [`.pages.yml: ${message} (not recorded in site-check.json)`]
  return []
}
