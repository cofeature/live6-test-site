export type PhotoKind = 'jpeg' | 'png' | 'webp' | 'gif'

export interface StripResult {
  ok: true
  bytes: Buffer
  kind: PhotoKind
  removed: number
}
export interface StripFailure {
  ok: false
  reason: string
}

export function detectKind(b: Buffer): PhotoKind | 'tiff' | 'heif' | 'svg' | 'unknown'
export function stripPhotoMetadata(
  bytes: Buffer,
  declaredImage: boolean,
): StripResult | StripFailure | { ok: true; bytes: Buffer; kind: undefined; removed: 0 }
export function imageDimensions(b: Buffer): { width: number; height: number } | undefined
export const OPERATOR_FIX: string
