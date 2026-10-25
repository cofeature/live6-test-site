import type { ReactNode } from 'react'

import { StudioInfo } from '../../components/StudioInfo'
import { getSite } from '../../lib/content'
import './globals.css'

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const site = await getSite()
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">{site.siteName || 'Home'}</a>
        <nav aria-label="Main">
          {site.nav.map((item) => (
            <a key={item.href + item.label} href={item.href}>{item.label}</a>
          ))}
        </nav>
      </header>
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        <nav aria-label="Footer">
          {site.footer.map((item) => (
            <a key={item.href + item.label} href={item.href}>{item.label}</a>
          ))}
        </nav>
        <StudioInfo compact />
      </footer>
    </>
  )
}
