import localFont from 'next/font/local';

// GIG brand type, bundled with the app so every user sees GI Sans whether or
// not it is installed on their PC. Served from /_next/static/media.
export const giSansText = localFont({
  src: [
    { path: './fonts/GiSansText-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/GiSansText-Italic.ttf', weight: '400', style: 'italic' },
    { path: './fonts/GiSansText-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/GiSansText-MediumItalic.ttf', weight: '500', style: 'italic' },
    { path: './fonts/GiSansText-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/GiSansText-SemiBoldItalic.ttf', weight: '600', style: 'italic' },
    { path: './fonts/GiSansText-Bold.ttf', weight: '700', style: 'normal' },
    { path: './fonts/GiSansText-BoldItalic.ttf', weight: '700', style: 'italic' },
  ],
  variable: '--font-gi-sans-text',
  display: 'swap',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
});

export const giSansDisplay = localFont({
  src: [
    { path: './fonts/GiSansDisplay-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/GiSansDisplay-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/GiSansDisplay-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/GiSansDisplay-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-gi-sans-display',
  display: 'swap',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
});
