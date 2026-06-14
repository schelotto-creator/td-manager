"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CLUB_STATUS } from '@/lib/season-draft';
import { Trophy, ArrowRight, User, Shield, Loader2, PaintBucket } from 'lucide-react';
import { useRouter } from 'next/navigation';

type EscudoProps = {
  forma?: string;
  color?: string;
  className?: string;
};

function EscudoSVG({ forma, color, className }: EscudoProps) {
  const renderPath = () => {
    switch (forma) {
      case 'circle': return <circle cx="12" cy="12" r="10" />;
      case 'square': return <rect x="3" y="3" width="18" height="18" rx="2" />;
      case 'modern': return <path d="M5 3h14a2 2 0 012 2v10a8 8 0 01-8 8 8 8 0 01-8-8V5a2 2 0 012-2z" />;
      case 'hexagon': return <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />;
      default: return <path d="M12 2.17a11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.644-.759-3.833a.75.75 0 00-.722-.515 11.209 11.209 0 01-7.877-3.08zM12 17.25a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5z" clipRule="evenodd" />;
    }
  };
  return (
    <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={`${className || 'w-full h-full'} drop-shadow-2xl`}>
       {renderPath()}
    </svg>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [managerName, setManagerName] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubForma, setClubForma] = useState('classic');
  const [clubColor, setClubColor] = useState('#ea580c'); 

  const colores = ['#ea580c', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#eab308', '#000000', '#ffffff'];
  const formas = ['classic', 'modern', 'circle', 'hexagon', 'square'];

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: mData } = await supabase.from('managers').select('id').eq('owner_id', user.id).limit(1);
      const { data: cData } = await supabase.from('clubes').select('id, status').eq('owner_id', user.id).limit(1);
      
      if (mData?.[0] && cData?.[0]) {
          if (cData[0].status === CLUB_STATUS.ROOKIE_DRAFT || cData[0].status === CLUB_STATUS.SEASON_DRAFT) {
              router.push('/draft-room');
          } else {
              const { count } = await supabase.from('players').select('*', { count: 'exact', head: true }).eq('team_id', cData[0].id);
              if (count && count > 0) {
                  router.push('/');
              }
          }
      }
    };
    checkUser();
  }, [router]);

  const handleFinishOnboarding = async () => {
    if (!managerName || !clubName) {
      setError("Por favor, rellena todos los campos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('No hay sesión activa');
      }
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          managerName,
          clubName,
          badgeShape: clubForma,
          primaryColor: clubColor
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'No se pudo crear la franquicia.');

      router.push('/draft-room');

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError("Error al crear la franquicia: " + errMsg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden text-slate-200">
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      <div className="w-full max-w-2xl relative z-10">
        
        <div className="flex justify-center gap-2 mb-12">
            <div className={`h-2 rounded-full transition-all duration-500 ${step >= 1 ? 'w-16 bg-cyan-500 shadow-[0_0_10px_#06b6d4]' : 'w-4 bg-slate-800'}`}></div>
            <div className={`h-2 rounded-full transition-all duration-500 ${step >= 2 ? 'w-16 bg-orange-500 shadow-[0_0_10px_#f97316]' : 'w-4 bg-slate-800'}`}></div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl rounded-[3rem] border border-white/5 p-8 md:p-12 shadow-2xl">
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs font-bold mb-8 text-center uppercase tracking-widest">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6 text-cyan-500">
                  <User size={40} />
                </div>
                <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white">Firma tu Contrato</h1>
                <p className="text-sm text-slate-400 mt-2 font-medium">La directiva confía en ti. ¿Cómo debemos llamarte, Coach?</p>
              </div>

              <div className="space-y-6 max-w-sm mx-auto">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Nombre y Apellido</label>
                  <input 
                    type="text" 
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="Ej: Phil Jackson"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl px-6 py-4 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-bold text-lg text-center"
                    autoFocus
                  />
                </div>
                
                <button 
                  onClick={() => managerName.length > 2 ? setStep(2) : setError("Introduce un nombre válido.")}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase text-sm py-4 rounded-2xl mt-4 transition-all flex items-center justify-center gap-2 group"
                >
                  Continuar <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6 text-orange-500">
                  <Shield size={40} />
                </div>
                <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white">Funda tu Franquicia</h1>
                <p className="text-sm text-slate-400 mt-2 font-medium">Dale una identidad a tu equipo. Empezarás desde lo más bajo.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Nombre del Equipo</label>
                    <input 
                      type="text" 
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="Ej: Barcelona Dragons"
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl px-6 py-4 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-bold text-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-1"><PaintBucket size={12}/> Color Principal</label>
                    <div className="flex gap-2 flex-wrap bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      {colores.map(color => (
                        <button 
                          key={color} 
                          onClick={() => setClubColor(color)}
                          className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${clubColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Forma del Escudo</label>
                    <div className="flex gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      {formas.map(f => (
                        <button 
                          key={f} 
                          onClick={() => setClubForma(f)}
                          className={`flex-1 p-2 rounded-xl transition-all ${clubForma === f ? 'bg-slate-800 ring-1 ring-orange-500' : 'hover:bg-slate-800/50'}`}
                        >
                          <EscudoSVG forma={f} color={clubColor} className="w-6 h-6 mx-auto opacity-80" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-8 bg-slate-950/50 rounded-3xl border border-white/5">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Previsualización Oficial</p>
                   <div className="w-40 h-40 relative flex items-center justify-center mb-6">
                      <EscudoSVG forma={clubForma} color={clubColor} className="w-full h-full" />
                   </div>
                   <h3 className="text-xl font-black italic uppercase text-white text-center">{clubName || 'Tu Equipo'}</h3>
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Dirigido por {managerName || 'Coach'}</p>
                </div>

              </div>

              <div className="flex gap-4 mt-10">
                <button 
                  onClick={() => setStep(1)}
                  className="px-6 py-4 rounded-2xl font-bold text-sm text-slate-400 hover:bg-slate-800 transition-all uppercase"
                >
                  Volver
                </button>
                <button 
                  onClick={handleFinishOnboarding}
                  disabled={loading || !clubName}
                  className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black uppercase text-sm py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group shadow-[0_0_20px_rgba(234,88,12,0.3)]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Trophy className="w-5 h-5" /> Ir al Draft</>}
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
