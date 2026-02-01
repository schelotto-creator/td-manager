"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Definimos qué datos tiene un jugador
interface Jugador {
  id: string;
  nombre: string;
  posicion: string;
  valor: number;
  puntos_media: number;
}

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const getData = async () => {
      // 1. Obtener usuario
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        
        // 2. Obtener sus jugadores de la tabla que creamos
        const { data, error } = await supabase
          .from('jugadores')
          .select('*')
          .order('valor', { ascending: false });

        if (!error && data) setJugadores(data);
      } else {
        window.location.href = '/login';
      }
      setCargando(false);
    };
    getData();
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-950 text-white font-sans pb-24 md:pb-0">
      
      {/* SIDEBAR (Desktop) */}
      <aside className="hidden md:flex w-72 bg-slate-900 border-r border-slate-800 p-8 flex-col">
        <h1 className="text-3xl font-black text-orange-500 italic tracking-tighter mb-10">TD MANAGER</h1>
        <nav className="flex-1 space-y-3 font-bold">
          <div className="p-4 bg-orange-600/10 text-orange-500 rounded-2xl border border-orange-500/20">🏠 INICIO</div>
          <div className="p-4 text-slate-500 hover:bg-slate-800 rounded-2xl cursor-not-allowed transition-all">🏀 MI PLANTILLA</div>
        </nav>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')} className="mt-auto text-slate-600 hover:text-red-400 text-sm font-bold underline">Cerrar Sesión</button>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="mb-10">
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight">MI EQUIPO</h2>
          <p className="text-slate-400 text-sm mt-2 italic">{userEmail || 'Cargando...'}</p>
        </header>

        {/* LISTA DE JUGADORES */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-orange-500 text-xs font-black uppercase tracking-[0.2em]">Quinteto Inicial</h3>
            <span className="text-[10px] bg-slate-800 px-3 py-1 rounded-full text-slate-400 font-bold">{jugadores.length} / 5</span>
          </div>

          <div className="space-y-4">
            {cargando ? (
              <p className="text-slate-500 animate-pulse">Buscando jugadores en el vestuario...</p>
            ) : jugadores.length > 0 ? (
              jugadores.map((jugador) => (
                <div key={jugador.id} className="flex items-center justify-between bg-slate-900 p-5 rounded-[2rem] border border-slate-800 hover:border-orange-500/50 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-slate-800 to-slate-700 rounded-full flex items-center justify-center font-black text-slate-400 group-hover:text-orange-500 transition-colors">
                      {jugador.posicion.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-black text-lg leading-none">{jugador.nombre}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 tracking-wider">{jugador.posicion}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-mono font-bold">{jugador.valor.toLocaleString()} €</p>
                    <p className="text-[10px] text-slate-500 font-black italic">{jugador.puntos_media} PTS</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 border-2 border-dashed border-slate-800 rounded-[2.5rem] text-center text-slate-600 font-bold italic">
                No tienes jugadores. Ve al SQL Editor de Supabase para crearlos.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* NAV INFERIOR (Móvil) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 px-8 py-5 flex justify-between items-center z-50">
        <div className="text-orange-500 flex flex-col items-center gap-1"><span className="text-xl">🏠</span><span className="text-[8px] font-black uppercase">Inicio</span></div>
        <div className="text-slate-500 flex flex-col items-center gap-1 opacity-50"><span className="text-xl">🏀</span><span className="text-[8px] font-black uppercase">Equipo</span></div>
        <div className="text-slate-500 flex flex-col items-center gap-1 opacity-50"><span className="text-xl">📊</span><span className="text-[8px] font-black uppercase">Liga</span></div>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')} className="text-slate-500 flex flex-col items-center gap-1"><span className="text-xl">🚪</span><span className="text-[8px] font-black uppercase">Salir</span></button>
      </nav>
    </div>
  );
}