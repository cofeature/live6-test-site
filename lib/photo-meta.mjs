// Removes location, camera-owner and other embedded metadata from photos without re-compressing the
// picture, then re-checks the result. Supports JPEG, PNG, WebP and GIF. Any other image format that can
// carry metadata (TIFF, HEIC, AVIF, SVG with a <metadata> block) is refused rather than passed through.

const u16 = (b, o) => b.readUInt16BE(o)

export function detectKind(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'gif'
  if (b.length >= 4 && (b.toString('latin1', 0, 4) === 'II*\0' || b.toString('latin1', 0, 4) === 'MM\0*')) return 'tiff'
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return 'heif'
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(b.toString('utf8', 0, Math.min(b.length, 2048)))) return 'svg'
  return 'unknown'
}

// --- JPEG ---------------------------------------------------------------------------------

/** A minimal Exif block holding only the orientation, so a rotated phone photo still displays upright. */
function orientationOnlyExif(orientation) {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4)
  tiff.write('MM', 0, 'latin1')
  tiff.writeUInt16BE(0x002a, 2)
  tiff.writeUInt32BE(8, 4)
  tiff.writeUInt16BE(1, 8) // one entry
  tiff.writeUInt16BE(0x0112, 10) // Orientation
  tiff.writeUInt16BE(3, 12) // SHORT
  tiff.writeUInt32BE(1, 14)
  tiff.writeUInt16BE(orientation, 18)
  tiff.writeUInt32BE(0, 22) // no next IFD
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const seg = Buffer.alloc(4 + body.length)
  seg.writeUInt16BE(0xffe1, 0)
  seg.writeUInt16BE(body.length + 2, 2)
  body.copy(seg, 4)
  return seg
}

/** Orientation value (1–8) from an Exif APP1 body (after "Exif\0\0"), or undefined. */
function exifOrientation(tiff) {
  if (tiff.length < 8) return undefined
  const le = tiff.toString('latin1', 0, 2) === 'II'
  if (!le && tiff.toString('latin1', 0, 2) !== 'MM') return undefined
  const r16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o))
  const r32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o))
  const ifd = r32(4)
  if (ifd + 2 > tiff.length) return undefined
  const n = r16(ifd)
  for (let i = 0; i < n; i += 1) {
    const e = ifd + 2 + i * 12
    if (e + 12 > tiff.length) return undefined
    if (r16(e) === 0x0112) {
      const v = r16(e + 8)
      return v >= 2 && v <= 8 ? v : undefined
    }
  }
  return undefined
}

function isOrientationOnly(body) {
  return body.equals(orientationOnlyExif(exifOrientation(body.subarray(6)) ?? 0).subarray(4)) && exifOrientation(body.subarray(6)) !== undefined
}

function jpegSegments(b) {
  const out = []
  let o = 2
  while (o < b.length) {
    if (b[o] !== 0xff) return undefined
    let marker = b[o + 1]
    while (marker === 0xff) {
      o += 1
      marker = b[o + 1]
    }
    if (marker === 0xd9) return out.concat({ marker, start: o, end: o + 2 })
    if (marker === 0xda) return out.concat({ marker, start: o, end: b.length }) // entropy-coded data to the end
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push({ marker, start: o, end: o + 2 })
      o += 2
      continue
    }
    if (o + 4 > b.length) return undefined
    const len = u16(b, o + 2)
    if (len < 2 || o + 2 + len > b.length) return undefined
    out.push({ marker, start: o, end: o + 2 + len })
    o += 2 + len
  }
  return undefined // ran out of bytes before the scan or the end marker: truncated
}

function keepJpegSegment(b, s) {
  const m = s.marker
  if (m === 0xe0 || m === 0xee) return true // JFIF, Adobe colour transform
  if (m === 0xe2) return b.toString('latin1', s.start + 4, s.start + 16) === 'ICC_PROFILE\0' // colour profile only
  if (m >= 0xe1 && m <= 0xef) return false // Exif/XMP, Photoshop/IPTC, vendor blocks
  if (m === 0xfe) return false // comment
  return true
}

function stripJpeg(b) {
  const segs = jpegSegments(b)
  if (!segs) return undefined
  const kept = []
  let removed = 0
  let orientation
  let afterJfif = 0 // how many kept segments precede the orientation block
  for (const s of segs) {
    if (s.marker === 0xe1 && b.toString('latin1', s.start + 4, s.start + 10) === 'Exif\0\0') {
      orientation = exifOrientation(b.subarray(s.start + 10, s.end))
    }
    if (keepJpegSegment(b, s)) {
      kept.push(b.subarray(s.start, s.end))
      if (s.marker === 0xe0 && kept.length === 1) afterJfif = 1
    } else removed += 1
  }
  // A rotated phone photo keeps only its orientation, so it still displays upright.
  if (orientation !== undefined) kept.splice(afterJfif, 0, orientationOnlyExif(orientation))
  return { bytes: Buffer.concat([b.subarray(0, 2), ...kept]), removed }
}

function jpegMetadataLeft(b) {
  const segs = jpegSegments(b)
  if (!segs) return ['unparseable JPEG']
  const left = []
  for (const s of segs) {
    if (s.marker === 0xe1) {
      if (!(b.toString('latin1', s.start + 4, s.start + 10) === 'Exif\0\0' && isOrientationOnly(b.subarray(s.start + 4, s.end)))) left.push('APP1')
    } else if (!keepJpegSegment(b, s)) left.push(`marker ${s.marker.toString(16)}`)
  }
  return left
}

// --- PNG ----------------------------------------------------------------------------------

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

function pngChunks(b) {
  const out = []
  let o = 8
  while (o + 12 <= b.length) {
    const len = b.readUInt32BE(o)
    const end = o + 12 + len
    if (end > b.length) return undefined
    out.push({ type: b.toString('latin1', o + 4, o + 8), start: o, end })
    o = end
    if (out[out.length - 1].type === 'IEND') return out
  }
  return undefined
}

function stripPng(b) {
  const chunks = pngChunks(b)
  if (!chunks) return undefined
  const kept = chunks.filter((c) => !PNG_DROP.has(c.type))
  return { bytes: Buffer.concat([b.subarray(0, 8), ...kept.map((c) => b.subarray(c.start, c.end))]), removed: chunks.length - kept.length }
}

const pngMetadataLeft = (b) => (pngChunks(b) ?? [{ type: 'unparseable PNG', start: 0, end: 0 }]).filter((c) => PNG_DROP.has(c.type) || c.type === 'unparseable PNG').map((c) => c.type)

// --- WebP ---------------------------------------------------------------------------------

const WEBP_DROP = new Set(['EXIF', 'XMP '])

function webpChunks(b) {
  const out = []
  let o = 12
  while (o + 8 <= b.length) {
    const len = b.readUInt32LE(o + 4)
    const end = o + 8 + len + (len % 2)
    if (end > b.length + 1) return undefined
    out.push({ type: b.toString('latin1', o, o + 4), start: o, end: Math.min(end, b.length) })
    o = end
  }
  return out
}

function stripWebp(b) {
  const chunks = webpChunks(b)
  if (!chunks) return undefined
  const kept = chunks.filter((c) => !WEBP_DROP.has(c.type))
  const body = Buffer.concat(kept.map((c) => {
    const chunk = Buffer.from(b.subarray(c.start, c.end))
    if (c.type === 'VP8X') chunk[8] = chunk[8] & ~(0x08 | 0x04) // clear the Exif and XMP flags
    return chunk
  }))
  const head = Buffer.from(b.subarray(0, 12))
  head.writeUInt32LE(body.length + 4, 4)
  return { bytes: Buffer.concat([head, body]), removed: chunks.length - kept.length }
}

const webpMetadataLeft = (b) => {
  const chunks = webpChunks(b)
  if (!chunks) return ['unparseable WebP']
  const left = chunks.filter((c) => WEBP_DROP.has(c.type)).map((c) => c.type)
  const vp8x = chunks.find((c) => c.type === 'VP8X')
  if (vp8x && (b[vp8x.start + 8] & 0x0c)) left.push('VP8X metadata flags')
  return left
}

// --- GIF ----------------------------------------------------------------------------------

function skipSubBlocks(b, o) {
  while (o < b.length) {
    const n = b[o]
    o += 1 + n
    if (n === 0) return o
  }
  return undefined
}

function gifBlocks(b) {
  if (b.length < 13) return undefined
  const flags = b[10]
  let o = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0)
  const out = [{ kind: 'header', start: 0, end: o }]
  while (o < b.length) {
    const t = b[o]
    if (t === 0x3b) {
      out.push({ kind: 'trailer', start: o, end: o + 1 })
      return out
    }
    if (t === 0x21) {
      const label = b[o + 1]
      let end
      let app
      if (label === 0xff) {
        app = b.toString('latin1', o + 3, o + 3 + (b[o + 2] ?? 0))
        end = skipSubBlocks(b, o + 2)
      } else end = skipSubBlocks(b, o + 2)
      if (end === undefined) return undefined
      out.push({ kind: 'extension', label, app, start: o, end })
      o = end
    } else if (t === 0x2c) {
      const lf = b[o + 9]
      const p = o + 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0) + 1
      const end = skipSubBlocks(b, p)
      if (end === undefined) return undefined
      out.push({ kind: 'image', start: o, end })
      o = end
    } else return undefined
  }
  return undefined
}

const gifKeep = (blk) =>
  blk.kind !== 'extension' || blk.label === 0xf9 || (blk.label === 0xff && /^(NETSCAPE2\.0|ANIMEXTS1\.0)$/.test(blk.app ?? ''))

function stripGif(b) {
  const blocks = gifBlocks(b)
  if (!blocks) return undefined
  const kept = blocks.filter(gifKeep)
  return { bytes: Buffer.concat(kept.map((k) => b.subarray(k.start, k.end))), removed: blocks.length - kept.length }
}

const gifMetadataLeft = (b) => (gifBlocks(b)?.filter((k) => !gifKeep(k)).map((k) => `extension ${k.label?.toString(16)}`) ?? ['unparseable GIF'])

// --- entry points -------------------------------------------------------------------------

const FORMAT_NAME = { tiff: 'TIFF', heif: 'HEIC/AVIF', svg: 'SVG', unknown: 'unrecognised image format' }

/**
 * Strips metadata from one photo and re-checks the result. `declaredImage` is true when the media
 * record says the file is an image; non-images (PDFs and the like) are returned untouched.
 */
export function stripPhotoMetadata(bytes, declaredImage) {
  if (!declaredImage) return { ok: true, bytes, kind: undefined, removed: 0 }
  const kind = detectKind(bytes)
  if (kind === 'svg') {
    return /<metadata\b|<rdf:|<dc:|<cc:|sodipodi:|inkscape:|<title\b|<desc\b/i.test(bytes.toString('utf8'))
      ? { ok: false, reason: 'SVG carries a metadata block' }
      : { ok: true, bytes, kind: undefined, removed: 0 }
  }
  if (kind === 'tiff' || kind === 'heif' || kind === 'unknown') return { ok: false, reason: `${FORMAT_NAME[kind]} can carry metadata and cannot be cleaned automatically` }
  const stripped = { jpeg: stripJpeg, png: stripPng, webp: stripWebp, gif: stripGif }[kind](bytes)
  if (!stripped) return { ok: false, reason: `${kind.toUpperCase()} file could not be read` }
  const left = { jpeg: jpegMetadataLeft, png: pngMetadataLeft, webp: webpMetadataLeft, gif: gifMetadataLeft }[kind](stripped.bytes)
  if (left.length) return { ok: false, reason: `metadata still present after cleaning (${left.join(', ')})` }
  return { ok: true, bytes: stripped.bytes, kind, removed: stripped.removed }
}

/** What the operator does when a photo stops an export. */
export const OPERATOR_FIX =
  'Open that photo on your own machine and remove its metadata (macOS Preview: Export with "Remove location info", or `exiftool -all= photo.jpg`), replace the photo in localever\'s admin, and export again.'

// --- dimensions (header-only; never decodes pixels) ----------------------------------------

/**
 * Width and height read from the file header, or undefined when the header is missing or malformed.
 * Used to refuse a decompression bomb before anything decodes the picture.
 */
export function imageDimensions(b) {
  const kind = detectKind(b)
  if (kind === 'png') {
    if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return undefined
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }
  if (kind === 'gif') {
    return b.length >= 10 ? { width: b.readUInt16LE(6), height: b.readUInt16LE(8) } : undefined
  }
  if (kind === 'webp') {
    const tag = b.toString('latin1', 12, 16)
    if (tag === 'VP8X' && b.length >= 30) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
    if (tag === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
      const bits = b.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (tag === 'VP8 ' && b.length >= 30) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    return undefined
  }
  if (kind === 'jpeg') {
    const segs = jpegSegments(b)
    if (!segs) return undefined
    for (const s of segs) {
      const m = s.marker
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && s.end - s.start >= 9) {
        return { width: b.readUInt16BE(s.start + 7), height: b.readUInt16BE(s.start + 5) }
      }
    }
    return undefined
  }
  return undefined
}
