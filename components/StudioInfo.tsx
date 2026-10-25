import { getStudio } from '../lib/content'

const lines = (s: string) => s.split(/\r?\n/).filter((l) => l.trim())

/** The studio's hours, phone, email and address. Blank fields show nothing, not an empty label. */
export async function StudioInfo({ compact = false }: { compact?: boolean }) {
  const s = await getStudio()
  const rows: [string, React.ReactNode][] = []
  if (s.hours.trim()) rows.push(['Hours', lines(s.hours).map((l, i) => <span key={i} className="line">{l}</span>)])
  if (s.phone.trim()) rows.push(['Phone', <a key="p" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a>])
  if (s.email.trim()) rows.push(['Email', <a key="e" href={`mailto:${s.email}`}>{s.email}</a>])
  if (s.address.trim()) rows.push(['Address', lines(s.address).map((l, i) => <span key={i} className="line">{l}</span>)])
  if (s.bookingUrl.trim()) rows.push(['Book', <a key="b" href={s.bookingUrl}>Book a class</a>])
  if (!rows.length) return null
  return (
    <dl className={compact ? 'studio-info compact' : 'studio-info'}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
