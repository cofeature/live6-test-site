import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  const indexing = process.env.ALLOW_INDEXING === 'true'
  return { rules: indexing ? { userAgent: '*', allow: '/' } : { userAgent: '*', disallow: '/' } }
}
