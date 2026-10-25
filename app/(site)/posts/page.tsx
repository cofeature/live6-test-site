import type { Metadata } from 'next'

import { getPosts } from '../../../lib/content'

export const metadata: Metadata = { title: 'Posts' }

export default async function PostsIndex() {
  const posts = await getPosts()
  return (
    <>
      <h1>Posts</h1>
      <ul className="post-list">
        {posts.map((p) => (
          <li key={p.slug}>
            <a href={`${p.route}/`}>{p.entry.title}</a>
            {p.date ? <div className="meta">{p.date.slice(0, 10)}</div> : null}
          </li>
        ))}
      </ul>
    </>
  )
}
