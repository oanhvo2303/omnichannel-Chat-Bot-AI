import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ngăn Turbopack scan lên workspace root (backend có package-lock.json riêng)
  // Next.js 15+: outputFileTracingRoot là root-level key, không còn trong experimental
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
