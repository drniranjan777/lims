import type { MetadataRoute } from 'next';

/** Web app manifest — lets Chrome, Edge and Safari install NLIMS as a desktop app (served at /manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NLIMS — Lab Management System',
    short_name: 'NLIMS',
    description: 'Laboratory workflows, results and reporting for Lucid Labs.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f5f7',
    theme_color: '#062852',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
