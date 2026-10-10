import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'AEGIS Safety Vision - Industrial AI Operations Platform',
  description: 'Real-time computer vision monitoring platform for worker safety, PPE verification, geofencing, attendance, and incident management.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-industrial-950 text-gray-100 min-h-screen antialiased flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 pl-64 pt-16 p-6 overflow-x-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
