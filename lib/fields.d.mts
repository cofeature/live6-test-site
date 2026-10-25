export interface FieldDef {
  name: string
  label: string
  type: 'string' | 'text' | 'rich-text' | 'number' | 'image' | 'object'
  list?: boolean
  hidden?: boolean
  fields?: FieldDef[]
}
export const fields: Record<'pages' | 'posts' | 'instructors' | 'studio' | 'site', FieldDef[]>
export function allowedKeys(name: string): string[]
