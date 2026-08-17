/** @type {import('next').NextConfig} */
const nextConfig = {
  // The chart repo lives alongside the app at the repo root. Nothing here writes to data/.
  // athlete/constants.json is read at runtime (not just build time) by scripts/lib/athlete.mjs,
  // which src/lib/log-write.ts pulls in transitively — without this, Vercel's file tracer never
  // bundles it, and any route whose server chunk happens to load that module crashes with ENOENT
  // the moment the module evaluates, since the read is at module scope, not inside a function.
  outputFileTracingIncludes: {
    '/**': ['./src/generated/**', './athlete/constants.json'],
  },
  // CLAUDE.md here is the coaching charter, not framework agent docs — `next dev`/`next build`
  // otherwise auto-appends a Next.js block to it on every run.
  agentRules: false,
}

export default nextConfig
