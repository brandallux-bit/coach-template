/** @type {import('next').NextConfig} */
const nextConfig = {
  // The chart repo lives alongside the app at the repo root. Nothing here writes to data/.
  outputFileTracingIncludes: {
    '/**': ['./src/generated/**'],
  },
}

export default nextConfig
