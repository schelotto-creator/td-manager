"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase'; // <--- El alias @/ es el truco maestro

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
      } else {
        window.location.href = '/login'; // Si no hay usuario, al login
      }
    };
    checkUser();
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-white font-sans">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col">
        <h1 className="text-2xl font-black text-orange-500 italic mb-10 tracking-tighter">TD MANAGER</h1>
        <nav className="flex-1 space-y-4 font-bold text-sm text-slate-500">
          <div className="text-orange-500 cursor-pointer">🏠 INICIO</div>
          <div className="hover:text-slate-300 cursor-pointer">🏀 MI PLANTILLA</div>
        </nav>
      </aside>
      <main className="flex-1 p-10">
        <header className="flex justify-between items-center mb-10">
          <h2 className="text-4xl font-black uppercase tracking-tight">Panel de Control</h2>
          <button 
            onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
            className="text-xs font-bold text-slate-500 hover:text-red-500 underline"
          >
            CERRAR SESIÓN
          </button>
        </header>
        <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl border-t-4 border-t-orange-600">
          <p className="text-orange-500 text-[10px] font-black mb-2 uppercase tracking-widest">Manager Oficial</p>
          <p className="text-2xl font-bold italic">{userEmail || 'Conectando...'}</p>
        </div>
      </main>
    </div>
  );
}