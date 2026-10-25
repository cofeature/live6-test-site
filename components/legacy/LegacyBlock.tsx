import sanitizeHtml from 'sanitize-html'

import { cleanOptions, CONTROL_CHARS_RE, MAX_FRAGMENT_BYTES } from '../../lib/clean-options.mjs'

/**
 * Preserved HTML from the original site, cleaned again at build time with the same allowlist the
 * exporter used. If cleaning would change the block, the build stops instead of publishing a version
 * the editor did not save.
 */
export function Legacy({ html }: { html: string }) {
  const input = html ?? ''
  if (input.length > MAX_FRAGMENT_BYTES || CONTROL_CHARS_RE.test(input)) throw new Error('Preserved HTML cannot be cleaned safely (size or control characters).')
  const clean = sanitizeHtml(input, cleanOptions)
  if (clean !== input) throw new Error('Preserved HTML contains something cleaning would change; it was not rewritten.')
  if (sanitizeHtml(clean, cleanOptions) !== clean) throw new Error('Preserved HTML cleaning is not stable when repeated.')
  return <div className="legacy" dangerouslySetInnerHTML={{ __html: clean }} />
}
