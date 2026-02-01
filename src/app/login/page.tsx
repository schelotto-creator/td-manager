"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase'; // <--- El alias infalible que arregló todo

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  
  // Este es el interruptor: true para entrar, false para darse de alta
  const [esModoLogin, setEsModoLogin] = useState(true);

  const ejecutarAccion = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje("⏳ Conectando con el pabellón...");

    try {
      if (esModoLogin) {
        // --- LOGICA PARA ENTRAR ---
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setMensaje("✅ ¡Bienvenido, Manager! Entrando...");
        window.location.href = '/'; 
      } else {
        // --- LOGICA PARA DARSE DE ALTA ---
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMensaje("✅ ¡Equipo fundado! Ahora ya puedes entrar.");
        setEsModoLogin(true); // Cambiamos a modo login automáticamente
      }
    } catch (err: any) {
      setMensaje("❌ " + err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white p-4 font-sans text-center">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-10 rounded-[3rem] shadow-2xl transition-all">
        
        <header className="mb-8">
          <h1 className="text-5xl font-black text-orange-500 italic tracking-tighter mb-2">TD MANAGER</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
            {esModoLogin ? "Acceso al Vestuario" : "Nueva Franquicia"}
          </p>
        </header>

        {mensaje && (
          <div className={`mb-6 p-4 rounded-2xl text-xs font-bold ${
            mensaje.includes('❌') 
              ? 'bg-red-500/10 text-red-400 border border-red-500/30' 
              : 'bg-green-500/10 text-green-400 border border-green-500/30'
          }`}>
            {mensaje}
          </div>
        )}

        <form onSubmit={ejecutarAccion} className="space-y-4">
          <input
            type="email"
            placeholder="Email del Manager"
            className="w-full p-4 rounded-2xl bg-slate-800 border border-slate-700 outline-none focus:border-orange-500 transition-all text-center"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            className="w-full p-4 rounded-2xl bg-slate-800 border border-slate-700 outline-none focus:border-orange-500 transition-all text-center"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-orange-900/20 active:scale-95"
          >
            {enviando ? "PROCESANDO..." : esModoLogin ? "ENTRAR A MI EQUIPO" : "FUNDAR MI EQUIPO"}
          </button>
        </form>

        <footer className="mt-8 border-t border-slate-800 pt-6">
          <button 
            type="button"
            onClick={() => setEsModoLogin(!esModoLogin)}
            className="text-slate-400 text-sm hover:text-orange-500 transition-colors font-bold underline"
          >
            {esModoLogin 
              ? "¿Eres nuevo? Regístrate aquí" 
              : "¿Ya tienes cuenta? Entra aquí"}
          </button>
        </footer>
      </div>
    </div>
  );
}