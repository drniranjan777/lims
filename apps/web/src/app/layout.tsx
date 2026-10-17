import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers';
import './globals.css';

// SN Pro (SIL OFL 1.1, from github.com/google/fonts ofl/snpro) — self-hosted variable font, weights 200–900.
// The UI uses no italics, so only the upright file is loaded.
const snPro = localFont({
  src: '../fonts/SNPro-VF.woff2',
  weight: '200 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-sn-pro',
});

export const metadata: Metadata = {
  title: { default: 'NLIMS', template: '%s · NLIMS' },
  description: 'NLIMS — Lab Management System for Lucid Labs',
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'NLIMS', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#062852' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={snPro.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
