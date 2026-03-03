'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar'; // <-- Ajusta la ruta de tu Sidebar si es diferente
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Detectamos si estamos en login o onboarding
  const isAuthPage = pathname === '/login' || pathname === '/onboarding';

  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-200 font-sans overflow-hidden flex h-screen">
        
        {/* Solo mostramos el Sidebar si NO estamos en una página de autenticación */}
        {!isAuthPage && <Sidebar />}

        <main className="flex-1 overflow-y-auto h-full relative">
          {children}
        </main>
        
      </body>
    </html>
  );
}