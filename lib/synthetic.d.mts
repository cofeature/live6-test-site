export const SYNTHETIC_FIXTURE_DIGEST: string
export const PAGES_CONFIG_STAMP_PREFIX: string
export function fixtureDigest(markerBytes: Uint8Array, manifestBytes: Uint8Array): string
export function stampOf(yamlText: string): string | undefined
export function pagesConfigProblems(yamlBytes: Uint8Array | string, record: { sha256?: string; fixtureDigest?: string } | undefined): string[]
