import type { NextConfig } from 'next'

// One static build: plain files in out/. There is no editor and no second build.
const config: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  // Next writes AGENTS.md / CLAUDE.md into a project it runs in; they don't belong in a client repo.
  agentRules: false,
  // Pin the project root so a parent folder's lockfile is never mistaken for it.
  turbopack: { root: process.cwd() },
  output: 'export',
}

export default config
