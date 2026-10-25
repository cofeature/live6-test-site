# Operations: hosting and hand-over

Everything here is a manual setup step. Nothing in this repository creates accounts, repositories or deployments. Until the later steps that connect an editor and a host are finished and approved, this project is not connected to any of them.

## 0. Before the first push (always)

1. `npm run check:independence` and `npm run check:secrets` both pass.
2. The GitHub repository is **private from its first commit**. Git history cannot be cleanly rewritten after a push.

## 1. Hosting

The site is one static build (`npm run build`, output `out/`). It carries the client's content, so any deployment of it stays behind a login (on Vercel, Deployment Protection for **all deployments**). Check that the plan covers it before adding real content. If it does not, use a preview-only setup: set the production branch to a branch nobody uses (for example `no-production`; it must exist first), so every commit is a protected preview. Going public later is one deliberate setting change.

The robots tags only ask search engines to stay away; protection is the access control. An exported site has no editor, so there is no second deployment.

## 2. Checks the export runs for you

Every export checks the finished file set before writing anything. It stops, writing nothing, if:

- any file mentions an editor or an old-format content file, or a Markdown file holds template-tag syntax;
- text from a draft, an excluded page or a removed line, the name of a draft-only photo, the storage bucket, an application setting name, or a record number in a key position appears in the content, photos folder, report, manifest or redirect files;
- a secret-shaped value appears anywhere that is published or reported.

A failure prints the kind of problem and an eight-character code for the file. The full file names, and the names of skipped drafts, go to a log on the operator's machine, named in the export's final message; do not share that log.

**Limits.** The exposure check cannot see an ID or draft sentence buried inside free text or a URL, and it ignores removed lines shorter than 12 characters and draft paragraphs shorter than 40. It is weaker than a live scan of a deployed editor. What makes up for it: nothing is connected to Pages CMS, GitHub or Cloudflare until the later steps pass, no real-client export is handed off before then, and cleaning plus these checks run on every export.

### When a photo stops an export

Photos are cleaned of location and camera-owner data during export, without recompressing the picture. JPEG, PNG, WebP and GIF are handled. A TIFF, HEIC, AVIF or an SVG with a metadata block stops the export. To fix one: open the photo on your own machine and remove its metadata (macOS Preview: Export with "Remove location info", or `exiftool -all= photo.jpg`), replace the photo at its source, and export again.

## 2b. The edit-safety check (once an editor is connected)

Every export prints a **fingerprint** of the protected files (everything outside the editable folders). Before the first build, set it as `SITE_PROTECTED_DIGEST` in the hosting project's build settings, where an editor cannot reach it. The build refuses to run without it. To compute it again from a copy you trust: `npm ci --ignore-scripts && npm run check:site -- --print-digest`. Whenever an operator deliberately changes a protected file, compute and set the new value.

A new outside website that an editor may link to is added by an operator: add it to `allowedHosts` in `site-check.json`, then recompute and set the fingerprint.

**What stops an editor from changing the build files.** The check and the build cleaning are the second layer. The binding limit is the editor's own configuration: invite editors by email only (never as repository users), and use an editor build that writes only inside the folders listed in `.pages.yml` with an exact folder match, cannot change `.pages.yml`, create branches or run actions, and holds only Contents and Metadata access to the repository. **That limit is specified but not yet in force and not yet proven against a live editor.** Until it is, the boundary is open: do not connect a real client. The hosted Pages CMS service is acceptable for tests with made-up content only.

**What a failed build means.** The site keeps serving its last good build. The editor sees nothing in the editor; the build log names the file and the rule. Accepted for now: someone with an editor sign-in can keep breaking the build (the live site stays up but cannot be updated); PDF files keep their author details and are not scanned; SVG files from the original site are published as exported.

## 2c. Live checks on a made-up site (Story 6)

**What has been proven live: nothing yet.** The code half is in place and tested here: the made-up test data carries a marker and a list of every file's fingerprint, the Pages CMS settings file is stamped and the build refuses one without the stamp, and a test fails if any code path could give a real client's export that file. The live half (an edit through Pages CMS reaching GitHub and Cloudflare, hostile edits, revocation, secret scans) is run by the owner on a made-up site once the access model is approved, and its results are recorded in Story 6 and the epic. Until they are, treat every claim about Pages CMS or Cloudflare behaviour as unverified.

**The real-client block.** Real exports never get a Pages CMS settings file. Do not add one by hand to a client repository, and do not connect a client export to Pages CMS, GitHub or Cloudflare until the owner has recorded a dated unlock in the epic stating that the live checks passed and the processor and privacy question is answered. This is a test plus a process, not a lock: someone with write access to a client repository could still wire it up by hand, which is accepted risk.

**Access model for the test site (summary, roles only).** One free GitHub organization owned by the owner, one private repository made from `scripts/live-check.ts prepare`, one test editor invited by email in Pages CMS (never a repository collaborator), and a separate GitHub account that plays the collaborator for git-level hostile edits. Pages CMS and Cloudflare are installed on that one repository only. The owner holds every sign-in; no token is held by an agent. A ruleset on `main` blocks force-push and branch deletion with an empty bypass list and no required review. Revocation at the end removes the editor, uninstalls both apps, deletes or disconnects the Cloudflare project, and re-scans, within the maximum time the owner sets beforehand.

**Approved tolerance list.** After an unchanged open-and-save in Pages CMS only these may differ, approved 24.10.26 (machine copy: `tests/fixtures/live-check/tolerance.json`): trailing whitespace on a line; a missing or extra final newline; quote style of front-matter values; order of front-matter keys. Anything else, including any change inside page text or a preserved block, counts as a change. Compare with `npx tsx scripts/live-check.ts compare <before> <after>`.

**Cloudflare setup, as it will be observed on the made-up site (not a client guarantee).** Production branch `main`, previews off for other branches, build command `npm ci && npm run build`, output folder `out`, Node 22, one environment value `SITE_PROTECTED_DIGEST`. Whether a failed build leaves the previous deployment live is recorded only for that setup.

## 3. Access and hand-over

- Give the client edit access through the editor chosen in the later steps, not repository access.
- A second operator receives a **full copy of the content**, so they must be someone the owner trusts. They create their own private repository and hosting project with the same plan check and protection.
- When an operator leaves: revoke their repository access, any editor seat, and hosting tokens or deploy keys, then confirm they can no longer push.

## 4. Secrets inventory

No secret belongs in this repository. `npm run check:secrets` scans content, the asset manifest, the export report and redirect files for JWTs, database and storage keys, GitHub, Cloudflare and Pages CMS tokens, connection strings, signed URLs and secret assignments.

## 5. Content privacy

Exported content is the original website's public text, which may include staff names and published contact details. Treat the repository as private.
