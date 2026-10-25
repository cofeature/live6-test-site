# Static site from plain Markdown files

This project is a website that builds to plain static files. It has no runtime dependency on the system that exported it and contains no editor: the content is Markdown in this repository, the images are in `public/assets/`, and the site settings are in `content/site.yaml`. Any tool that edits Markdown files with YAML frontmatter can edit it (see "Editing" below).

## Layout

- `content/pages/*.md`, `content/posts/*.md` — page and post text (CommonMark with a YAML header). One flat folder: a page's public address is stored in its `route` field, not in its file name.
- `content/instructors/*.md` — one record per instructor; the instructor-list block renders them in `order`.
- `content/studio.yaml` — opening hours, phone, email, address and booking link, shown in the footer and available as a block.
- `content/site.yaml` — site name, navigation and footer links.
- `public/assets/<pages|posts|post-heroes|instructors>/<entry>/<file>` — each entry's own photos (a photo used on two pages is stored twice). Other files (PDFs) are flat in `public/assets/`. Location and camera-owner data was removed from photos when the site was exported.
- `excluded/` — pages and lines an operator approved for removal, kept unpublished. Never served by any build.
- `REVIEW.md`, `review-report.json` — what the exporter filled in, left blank and flagged for review.
- `public/<old-path>/index.html` — small "moved" pages for the original site's old addresses. `vercel.json` and `public/_redirects` carry true 301 rules for Vercel and Netlify.
- `asset-manifest.json`, `export-report.json` — what was copied, what could not be, and what changed in conversion (report format version 2).
- `site-check.json` — the websites a content file may link to (written by the export, not for editing) and a record of every protected file. See "Edit safety" below.

Preserved content from the old site that could not be turned into Markdown sits in a fenced block whose first line is ```` ```site:legacy-html ````. Other Markdown tools show it as a block of code; this site cleans it again with a fixed allowlist and shows it as normal content. Do not edit inside these blocks. Two other reserved blocks, `site:instructor-list` and `site:studio-info`, are empty and render the instructor list and the Studio info.

Raw HTML anywhere else in the Markdown is not allowed: the build stops and names the file. Links and images may only use a path on this site, `mailto:`, `tel:`, or a full web address on a website listed in `site-check.json`.

## Commands

```bash
npm ci --ignore-scripts
npm run check:site         # the edit-safety check (runs first inside the build)
npm run build              # check, then static site into out/, then photo clean-up
npm run check:independence # nothing points at the exporting system; no editor; no secrets
npm run check:secrets      # secret-shaped values in content, manifest, report, redirects
npm run dev                # preview on your own computer
```

Dependencies are pinned to exact versions and the lockfile is small (under 100 entries, no install scripts), so the build needs no setup beyond `npm ci`.

## Edit safety

Everything an editor can change is treated as untrusted. Before the site is built, `npm run check:site` looks at every file in the editable folders and stops the build if one does not fit. While the site is built, the same rules are applied again to each file as it is read, and editable text is cleaned or refused. Nothing an editor saved is ever rewritten quietly: the build stops and names the file and the rule.

**Editable folders** (and nothing else): `content/pages/`, `content/posts/`, `content/instructors/`, `public/assets/`, `content/site.yaml` and `content/studio.yaml`.

**The check refuses:** YAML anchors, aliases and tags; duplicate or unknown fields; files over 512 KiB, or lines over 64 KiB; anything outside the editable folders or of an unexpected type; symbolic links; control, hidden or text-direction characters in names and text; names that differ only by case or look-alike letters; more than 2,000 files in a collection or 5,000 in the editable folders; photos that are not what their name says, are over 10 MiB, over 10,000 pixels a side or over 40 megapixels, or SVG files that were not part of the export; page addresses, photo paths, booking and menu links that are not a path on this site or a listed website; Markdown containing raw HTML; and a preserved block that the cleaning rules would change.

**Photos** added later keep their original file in the repository, but the published copy has location, owner and other hidden data removed (`scripts/publish-photos.mjs`, after the build). A photo that cannot be cleaned (TIFF, HEIC, AVIF, an SVG with a metadata block) stops the build, and the built folder is removed.

**Protected files.** Every file outside the editable folders is fingerprinted: `package.json`, the lockfile, `scripts/`, `lib/`, `app/`, `components/`, the build configuration, `.github/`, `.pages.yml`, `vercel.json`, the redirect and header files, and `site-check.json`. The expected fingerprint is the `SITE_PROTECTED_DIGEST` setting at the hosting project (see OPERATIONS.md). If it is missing, or any protected file differs, the build stops. The check is one layer, not a wall: someone who can change the build files could remove the check. The cleaning during the build is the main protection, and the limit on what an editor may write (see OPERATIONS.md) is what keeps editors away from the build files.

**What a failed build means.** An editor sees no message inside the editor. The site keeps showing its last good version, and the build log names the file and the rule. Someone who can read the build log fixes the file or the rule.

## Editing

The site reads only the fields listed in `lib/fields.mjs` and fails the build on any other key in a content file's header or in `content/site.yaml` / `content/studio.yaml`. Test exports made from the verified made-up data also contain a `.pages.yml` for Pages CMS, generated from that same list and stamped on its first line; the build refuses a `.pages.yml` that is not stamped for a verified made-up export. Client exports do not carry one, and must not be given one by hand. That file follows the Pages CMS documentation and has been tested only against this site's own reader, not against a live Pages CMS (a later step checks that), so it is not a guarantee that Pages CMS accepts it.

**Leaving Pages CMS.** Nothing here depends on it. The content is ordinary Markdown and YAML files, so any other Markdown editor, a static-site CMS or a plain text editor works with no change to the site.

## Search engines

The site tells search engines to stay away by default (page tag, `robots.txt`, `X-Robots-Tag` headers for Vercel and Netlify). That is only a request. **Deployment Protection (a login in front of the site) is the real access control.** To go public, do **both**: set `ALLOW_INDEXING=true` at build time, **and** remove the `X-Robots-Tag` rule from `vercel.json` and `public/_headers`. `ALLOW_INDEXING` only changes `robots.txt`; the headers are fixed files, and left in place they keep telling search engines not to index the site.

## Licences

Next.js, React, marked, yaml and sanitize-html are MIT-licensed. This project's content and images belong to their owner.
