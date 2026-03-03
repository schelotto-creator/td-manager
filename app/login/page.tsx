"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLogin) {
        // INICIAR SESIÓN
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Redirigir al inicio tras loguearse
        window.location.href = '/';
      } else {
        // REGISTRARSE
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess('¡Cuenta creada! Revisa tu email para confirmar (si tienes la confirmación activada) o inicia sesión.');
        setIsLogin(true); // Cambiamos a la vista de login
      }
    } catch (err: any) {
      setError(err.message || 'Ha ocurrido un error en la autenticación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Fondos Decorativos */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* LOGO */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl mb-6 shadow-orange-500/20">
            <Trophy className="w-10 h-10 text-yellow-400" />
          </div>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">
            TD <span className="text-orange-500">MANAGER</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.3em] mt-2">
            Simulador de Franquicia
          </p>
        </div>

        {/* TARJETA DE LOGIN */}
        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-black uppercase text-white">
              {isLogin ? 'Acceso General' : 'Nueva Franquicia'}
            </h2>
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(null); setSuccess(null); }}
              className="text-[10px] font-bold text-slate-400 hover:text-white uppercase transition-colors"
            >
              {isLogin ? 'Crear cuenta' : 'Ya tengo cuenta'}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-bold mb-6 text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-xl text-xs font-bold mb-6 text-center">
              {success}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            
            {/* Input Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-slate-500" />
                </div>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono text-sm"
                  placeholder="manager@equipo.com"
                />
              </div>
            </div>

            {/* Input Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-slate-500" />
                </div>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Botón Submit */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black uppercase text-xs py-4 rounded-xl mt-4 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Entrar al Despacho' : 'Fundar Franquicia'}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-slate-600 text-[9px] font-bold uppercase tracking-widest mt-8">
          TD Manager Alpha v0.1 • 2026
        </p>
      </div>
    </div>
  );
}