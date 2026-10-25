import { assetUrl, getInstructors } from '../lib/content'
import { renderMarkdown } from '../lib/markdown'

/** Every instructor record, in display order. */
export async function InstructorList() {
  const people = await getInstructors()
  if (!people.length) return null
  return (
    <div className="instructor-list">
      {people.map(({ slug, entry }) => (
          <section key={slug} className="instructor">
            <h2>{entry.name}{entry.role ? `, ${entry.role}` : ''}</h2>
            {entry.credentials ? <p><strong>{entry.credentials}</strong></p> : null}
            {entry.photo ? <img src={assetUrl(entry.photo)} alt={entry.photoAlt} /> : null}
            {renderMarkdown(entry.bio)}
          </section>
      ))}
    </div>
  )
}
