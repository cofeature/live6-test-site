import { Marked, type Token, type Tokens } from 'marked'
import type { ReactNode } from 'react'

import { InstructorList } from '../components/InstructorList'
import { StudioInfo } from '../components/StudioInfo'
import { Legacy } from '../components/legacy/LegacyBlock'
import { allowedHosts } from './content'
import { MARKDOWN_OPTIONS, urlProblem } from './site-rules.mjs'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The same address rules the pre-build check and the reader apply. If one is broken here the build stops;
// an address is never dropped or rewritten quietly.
function checkedUrl(href: string, kind: 'link' | 'image'): string {
  const why = urlProblem(href, { allowedHosts: allowedHosts(), kind })
  if (why) throw new Error(`${kind} address not allowed (${why}): ${href.slice(0, 80)}`)
  return href
}

const marked = new Marked({
  ...MARKDOWN_OPTIONS,
  renderer: {
    // Raw HTML written into the Markdown is never rendered and never shown; the build stops instead.
    html() {
      throw new Error('raw HTML outside a preserved block; use ordinary Markdown')
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens)
      return `<a href="${esc(checkedUrl(href, 'link'))}"${title ? ` title="${esc(title)}"` : ''}>${inner}</a>`
    },
    image({ href, title, text }) {
      return `<img src="${esc(checkedUrl(href, 'image'))}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''}>`
    },
  },
})

const SITE_FENCE = /^site:([a-z-]+)$/

/**
 * Renders a Markdown body. Reserved `site:` fences become the site's own pieces: the preserved old-site
 * HTML (cleaned again by the same allowlist the exporter used, and refused if cleaning would change it),
 * the instructor list and the Studio info. Everything else is ordinary Markdown; raw HTML or an address
 * that is not allowed stops the build.
 */
export function renderMarkdown(source: string): ReactNode[] {
  const tokens = marked.lexer(source ?? '')
  const out: ReactNode[] = []
  let run: Token[] = []
  const flush = () => {
    if (!run.length) return
    const batch = Object.assign([...run], { links: tokens.links })
    out.push(<div key={out.length} className="markdown" dangerouslySetInnerHTML={{ __html: marked.parser(batch) }} />)
    run = []
  }
  for (const token of tokens) {
    const fence = token.type === 'code' ? SITE_FENCE.exec(((token as Tokens.Code).lang ?? '').trim()) : null
    if (fence?.[1] === 'legacy-html') {
      flush()
      out.push(<Legacy key={out.length} html={(token as Tokens.Code).text} />)
    } else if (fence?.[1] === 'instructor-list') {
      flush()
      out.push(<InstructorList key={out.length} />)
    } else if (fence?.[1] === 'studio-info') {
      flush()
      out.push(<StudioInfo key={out.length} />)
    } else run.push(token)
  }
  flush()
  return out
}
