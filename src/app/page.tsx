"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || null);
      else window.location.href = '/login';
    };
    checkUser();
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-950 text-white font-sans pb-20 md:pb-0">
      
      {/* 1. BARRA LATERAL (Solo se ve en PC/Tablet) */}
      <aside className="hidden md:flex w-72 bg-slate-900 border-r border-slate-800 p-8 flex-col">
        <h1 className="text-3xl font-black text-orange-500 italic tracking-tighter mb-10">TD MANAGER</h1>
        <nav className="flex-1 space-y-3 font-bold">
          <div className="p-4 bg-orange-600/10 text-orange-500 rounded-2xl border border-orange-500/20 cursor-pointer">🏠 INICIO</div>
          <div className="p-4 text-slate-500 hover:bg-slate-800 rounded-2xl cursor-pointer transition-all">🏀 MI PLANTILLA</div>
          <div className="p-4 text-slate-500 hover:bg-slate-800 rounded-2xl cursor-pointer transition-all">📊 LIGA</div>
        </nav>
        <button 
          onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
          className="mt-auto p-4 text-slate-600 hover:text-red-400 text-sm font-bold transition-colors underline"
        >
          Cerrar Sesión
        </button>
      </aside>

      {/* 2. CONTENIDO PRINCIPAL (Se adapta a todo) */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-12 gap-4">
          <div>
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none">PANEL DE CONTROL</h2>
            <p className="text-slate-400 text-sm mt-2 italic">{userEmail || 'Conectando...'}</p>
          </div>
          {/* Botón de logout oculto en móvil (se usa el de abajo) */}
          <button 
            onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
            className="hidden md:block text-xs font-black text-slate-600 hover:text-orange-500 transition-colors"
          >
            LOGOUT
          </button>
        </header>

        {/* Tarjetas de Datos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 group-hover:bg-orange-500/10 transition-all"></div>
            <h3 className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Estado de Franquicia</h3>
            <p className="text-xl md:text-2xl font-bold italic leading-tight">Tu equipo está listo para el Draft de 2026.</p>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <h3 className="text-blue-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Presupuesto Inicial</h3>
            <p className="text-3xl md:text-4xl font-mono font-black text-green-400">500.000 €</p>
          </div>
        </div>
      </main>

      {/* 3. NAVEGACIÓN INFERIOR (Solo se ve en MÓVIL) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800 px-6 py-4 flex justify-between items-center z-50">
        <div className="flex flex-col items-center gap-1 text-orange-500">
          <span className="text-xl">🏠</span>
          <span className="text-[10px] font-black uppercase">Inicio</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-slate-500 opacity-50">
          <span className="text-xl">🏀</span>
          <span className="text-[10px] font-black uppercase">Equipo</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-slate-500 opacity-50">
          <span className="text-xl">📊</span>
          <span className="text-[10px] font-black uppercase">Liga</span>
        </div>
        <button 
          onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
          className="flex flex-col items-center gap-1 text-slate-500"
        >
          <span className="text-xl">🚪</span>
          <span className="text-[10px] font-black uppercase">Salir</span>
        </button>
      </nav>

    </div>
  );
}