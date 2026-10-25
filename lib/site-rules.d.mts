export const EDITABLE_FOLDERS: string[]
export const EDITABLE_FILES: string[]
export const COLLECTIONS: string[]
export function zoneOf(rel: string): string | null
export const LIMITS: Record<string, number>
export const IGNORED_ROOT: string[]
export function isIgnored(rel: string): boolean
export function isProtected(rel: string): boolean

export function decodeUtf8(buf: Buffer): { ok: true; text: string } | { ok: false; problem: string }
export function nameProblems(name: string): string[]
export function collisionKey(name: string): string
export function collisionGroups(paths: string[]): string[][]
export function textProblems(text: string, bytes: number): string[]
export function urlProblem(raw: unknown, opts: { allowedHosts?: Iterable<string>; kind?: 'link' | 'image' }): string | null
export function assetRefProblem(value: string): string | null
export function assetPathOf(value: string): string
export function parseStrictYaml(text: string): { data: Record<string, unknown>; problems?: undefined } | { problems: string[]; data?: undefined }
export function splitFrontmatter(text: string): { yaml: string | null; body: string }

export interface RuleContext {
  allowedHosts?: Iterable<string>
  assetExists?: (publicRel: string) => boolean
  clean?: (html: string) => string
}
export const MARKDOWN_OPTIONS: Readonly<{ gfm: boolean }>
export function bodyAddresses(body: string): string[]
export function bodyProblems(body: string, ctx?: RuleContext): string[]
export function contentFileProblems(rel: string, buf: Buffer, ctx?: RuleContext): string[]
export function collectionOf(rel: string): string | undefined
export function assetFileProblems(rel: string, buf: Buffer, svgHashes?: Set<string>): string[]

export function protectedHashes(files: { path: string; bytes: Buffer | string }[]): Record<string, string>
export function digestOf(hashes: Record<string, string>): string
export function protectedDiff(recorded: Record<string, string>, actual: Record<string, string>): string[]
