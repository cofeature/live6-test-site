import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getPages, normalize } from '../../../lib/content'
import { renderMarkdown } from '../../../lib/markdown'

export const dynamicParams = false

type Params = { slug?: string[] }

export async function generateStaticParams(): Promise<Params[]> {
  return (await getPages()).map((p) => ({ slug: p.route === '/' ? [] : p.route.split('/').filter(Boolean) }))
}

async function find(params: Promise<Params>) {
  const { slug } = await params
  const route = normalize((slug ?? []).join('/'))
  return (await getPages()).find((p) => p.route === route)
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const page = await find(params)
  if (!page) return {}
  return { title: page.entry.seoTitle || page.entry.title, description: page.entry.seoDescription || undefined }
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const page = await find(params)
  if (!page) notFound()
  const body = renderMarkdown(page.entry.body)
  return (
    <article>
      <h1>{page.entry.title}</h1>
      {body}
    </article>
  )
}
