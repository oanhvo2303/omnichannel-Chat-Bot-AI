export default function manifest() {
  return {
    name: 'OmniBot — Quản lý Chat Đa Kênh',
    short_name: 'OmniBot',
    description: 'Nền tảng quản trị chat đa kênh Facebook, Zalo tích hợp AI',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#3B82F6',
    orientation: 'portrait',
    scope: '/',
    lang: 'vi',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    screenshots: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'OmniBot Dashboard',
      },
    ],
  };
}
