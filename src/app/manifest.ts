import { MetadataRoute } from 'next';

import { siteConfig } from '@/constant/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.title,
    short_name: 'DPS Sim',
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#312e81',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
