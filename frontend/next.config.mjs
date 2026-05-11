import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix: Ngăn Turbopack scan lên workspace root (có package-lock.json của backend)
  // Hai lockfile ở root + frontend/ gây Next.js build warning
  outputFileTracingRoot: __dirname,
  experimental: {
    outputFileTracingRoot: __dirname,
  },
};

export default nextConfig;
