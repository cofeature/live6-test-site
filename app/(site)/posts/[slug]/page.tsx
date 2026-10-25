import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { assetUrl, getPosts } from '../../../../lib/content'
import { renderMarkdown } from '../../../../lib/markdown'

export const dynamicParams = false

type Params = { slug: string }

export async function generateStaticParams(): Promise<Params[]> {
  return (await getPosts()).map((p) => ({ slug: p.route.split('/').filter(Boolean).pop() ?? p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const post = (await getPosts()).find((p) => p.route === `/posts/${slug}`)
  return post ? { title: post.entry.seoTitle || post.entry.title, description: post.entry.seoDescription || undefined } : {}
}

export default async function Post({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const post = (await getPosts()).find((p) => p.route === `/posts/${slug}`)
  if (!post) notFound()
  const body = renderMarkdown(post.entry.body)
  const hero = assetUrl(post.entry.heroImage)
  return (
    <article>
      <h1>{post.entry.title}</h1>
      {post.date ? <p className="meta">{post.date.slice(0, 10)}{post.entry.categories.length ? ` · ${post.entry.categories.join(', ')}` : ''}</p> : null}
      {hero ? <img src={hero} alt="" /> : null}
      {body}
    </article>
  )
}
