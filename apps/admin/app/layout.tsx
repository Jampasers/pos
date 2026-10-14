import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Danka POS · Merchant', description: 'Dashboard merchant dan outlet Danka POS' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="id"><body>{children}</body></html>; }
