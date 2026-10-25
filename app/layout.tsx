import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// Search engines are asked to stay away unless ALLOW_INDEXING=true is set at build time.
// That is a request only; Deployment Protection is the actual access control.
const indexing = process.env.ALLOW_INDEXING === 'true'

export const metadata: Metadata = {
  robots: indexing ? { index: true, follow: true } : { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
