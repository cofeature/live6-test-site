// Runs after the build. Removes location, owner and other hidden data from every photo in the built
// site (out/), then re-checks each one. The saved originals in public/ are never touched. A photo that
// cannot be cleaned stops the build and the built folder is removed, so nothing unclean can be published.
//   node scripts/publish-photos.mjs out
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { detectKind, stripPhotoMetadata } from '../lib/photo-meta.mjs'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|tiff?|heic|heif|bmp)$/i

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.isFile()) yield full
  }
}

/** Cleans every photo under `outDir` in place. Returns `{ cleaned, problems }`. */
export function publishPhotos(outDir) {
  const problems = []
  let cleaned = 0
  for (const file of walk(outDir)) {
    const bytes = fs.readFileSync(file)
    // A photo by name, or by its first bytes whatever the name says.
    const isImage = IMAGE_EXT.test(file) || ['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif'].includes(detectKind(bytes))
    if (!isImage) continue
    const rel = path.relative(outDir, file).split(path.sep).join('/')
    const result = stripPhotoMetadata(bytes, true)
    if (!result.ok) {
      problems.push(`out/${rel}: ${result.reason}`)
      continue
    }
    if (!result.bytes.equals(bytes)) {
      fs.writeFileSync(file, result.bytes)
      cleaned += 1
    }
  }
  return { cleaned, problems }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outDir = path.resolve(process.argv[2] ?? 'out')
  if (!fs.existsSync(outDir)) {
    console.error('publish-photos: there is no built site to clean; run the build first.')
    process.exit(1)
  }
  let result
  try {
    result = publishPhotos(outDir)
  } catch (e) {
    result = { cleaned: 0, problems: [`photo cleaning could not finish (${String(e?.message ?? e).split('\n')[0]})`] }
  }
  if (result.problems.length) {
    fs.rmSync(outDir, { recursive: true, force: true })
    console.error('publish-photos FAILED — the built site was removed so nothing unclean can be published.')
    for (const p of result.problems) console.error('  ' + p)
    process.exit(1)
  }
  console.log(`publish-photos: removed hidden data from ${result.cleaned} photo(s) in the built site.`)
}
