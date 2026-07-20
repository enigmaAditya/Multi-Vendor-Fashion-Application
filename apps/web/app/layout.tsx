import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from './lib/cart-context';

export const metadata: Metadata = {
  title: 'Luxe Market | Premier Multi-Vendor Fashion Marketplace',
  description: 'Shop curated apparel, luxury outerwear, and exclusive streetwear.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
