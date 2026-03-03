"use client";
import React, { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Award, Coins, Crown, Lock, Palette, Save, Settings2,
  Sparkles, Target, Trash2, TrendingUp, Upload, User
} from 'lucide-react';

type EscudoForma = 'classic' | 'modern' | 'circle' | 'hexagon' | 'square';
type TalentKey = 'talento_ojo' | 'talento_lobo' | 'talento_idolo';

type ManagerData = {
  id: number;
  owner_id: string;
  nombre: string;
  nivel?: number;
  xp?: number;
  xp_siguiente?: number;
  puntos_talento?: number;
  victorias?: number;
  derrotas?: number;
  titulos?: number;
  talento_ojo?: number;
  talento_lobo?: number;
  talento_idolo?: number;
  [key: string]: string | number | null | undefined;
};

type ClubData = {
  id: number;
  owner_id: string;
  nombre: string;
  color_primario: string;
  color_secundario: string;
  jersey_home: string;
  jersey_away: string;
  escudo_forma?: EscudoForma | string | null;
  escudo_url?: string | null;
  [key: string]: string | number | null | undefined;
};

type MensajeState = { tipo: '' | 'success' | 'error'; texto: string; };
type EscudoProps = { forma?: EscudoForma | string | null; color?: string | null; logoUrl?: string | null; className?: string; };
type JerseyPreviewProps = {
  colorPrimario: string;
  colorSecundario: string;
  pattern?: string;
  label: string;
  teamName?: string;
  managerName?: string;
};
type TalentConfig = {
  key: TalentKey;
  icono: string;
  titulo: string;
  desc: string;
  foco: string;
  max: number;
  accent: string;
};

// --- COMPONENTE ESCUDO INCRUSTADO ---
function EscudoSVG({ forma, color, logoUrl, className }: EscudoProps) {
  if (logoUrl) {
    return <img src={logoUrl} alt="Escudo del Club" className={`${className || 'w-full h-full'} object-contain drop-shadow-md`} />;
  }
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
    <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={`${className || 'w-full h-full'} drop-shadow-md`}>
       {renderPath()}
    </svg>
  );
}

function EscudoRender({ forma, color, logoUrl, className = "w-12 h-12" }: EscudoProps) {
  return (
      <div className={`${className} relative flex items-center justify-center`}>
          <EscudoSVG forma={forma} color={color} logoUrl={logoUrl} className="w-full h-full" />
      </div>
  )
}

// --- COMPONENTES AUXILIARES PARA JERSEY PREMIUM ---
function JerseyPreview({ colorPrimario, colorSecundario, pattern, label, teamName, managerName }: JerseyPreviewProps) {
  const previewId = useId().replace(/:/g, '');
  const bodyClipId = `body_clip_${previewId}`;
  const baseGradientId = `base_gradient_${previewId}`;
  const sideGradientId = `side_gradient_${previewId}`;
  const glossGradientId = `gloss_gradient_${previewId}`;
  const depthGradientId = `depth_gradient_${previewId}`;
  const meshPatternId = `mesh_pattern_${previewId}`;
  const normalizedPattern = normalizeJerseyPattern(pattern);
  const isBackView = label.toLowerCase().includes('away');
  const jerseyNumber = '23';
  const wordmark = (teamName?.split(' ')[0] || 'CLUB').toUpperCase().slice(0, 10);
  const backName = (managerName?.split(' ')[0] || 'PLAYER').toUpperCase().slice(0, 10);
  const bodyShape = 'M32 14 H68 C72 14 75 16 77 20 L90 38 C92 42 92 47 90 51 L82 58 L78 122 H22 L18 58 L10 51 C8 47 8 42 10 38 L23 20 C25 16 28 14 32 14 Z';
  const cutColor = '#0a1120';

  return (
    <div className="flex flex-col items-center gap-3 group">
      <div className="relative w-40 h-44 bg-gradient-to-b from-slate-900 to-slate-950 rounded-[1.9rem] border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl transition-all duration-500 group-hover:scale-[1.03] group-hover:border-cyan-500/30">
        <div className="absolute inset-0 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700 group-hover:blur-2xl group-hover:opacity-30" style={{ backgroundColor: colorPrimario }}></div>
        <svg viewBox="0 0 100 130" className="w-[112px] h-[128px] drop-shadow-[0_12px_22px_rgba(0,0,0,0.72)] relative z-10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={baseGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colorPrimario} />
              <stop offset="100%" stopColor={colorPrimario} stopOpacity="0.92" />
            </linearGradient>
            <linearGradient id={sideGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colorSecundario} stopOpacity="0.96"/>
              <stop offset="100%" stopColor={colorSecundario} stopOpacity="0.8"/>
            </linearGradient>
            <linearGradient id={glossGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.2"/>
              <stop offset="40%" stopColor="white" stopOpacity="0.04"/>
              <stop offset="100%" stopColor="black" stopOpacity="0.18"/>
            </linearGradient>
            <linearGradient id={depthGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="black" stopOpacity="0.2" />
              <stop offset="50%" stopColor="black" stopOpacity="0" />
              <stop offset="100%" stopColor="black" stopOpacity="0.2" />
            </linearGradient>
            <pattern id={meshPatternId} x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.75" fill="white" opacity="0.2" />
            </pattern>
            <clipPath id={bodyClipId}>
              <path d={bodyShape} />
            </clipPath>
          </defs>

          <path d={bodyShape} fill={`url(#${baseGradientId})`} stroke="rgba(148,163,184,0.35)" strokeWidth="1.1" />

          <path d="M23 20 L10 38 C8 42 8 47 10 51 L18 58 L22 122 H30 L33 22 Z" fill={`url(#${sideGradientId})`} />
          <path d="M77 20 L90 38 C92 42 92 47 90 51 L82 58 L78 122 H70 L67 22 Z" fill={`url(#${sideGradientId})`} />

          <path d={bodyShape} fill={`url(#${meshPatternId})`} opacity="0.44" />

          {normalizedPattern === 'striped' && (
            <g clipPath={`url(#${bodyClipId})`} opacity="0.2" fill={colorSecundario}>
              <rect x="31" y="20" width="8" height="105" />
              <rect x="47" y="20" width="8" height="105" />
              <rect x="63" y="20" width="8" height="105" />
            </g>
          )}
          {normalizedPattern === 'hooped' && (
            <g clipPath={`url(#${bodyClipId})`} opacity="0.21" fill={colorSecundario}>
              <rect x="17" y="40" width="66" height="8" />
              <rect x="17" y="58" width="66" height="8" />
              <rect x="17" y="76" width="66" height="8" />
              <rect x="17" y="94" width="66" height="8" />
            </g>
          )}

          <ellipse cx="50" cy="19.8" rx="12.6" ry="6.6" fill={cutColor} />
          <path d="M22 22 C14 29 12 38 16 48 C19 47 22 44 24 40 C25 33 24 28 22 22 Z" fill={cutColor} />
          <path d="M78 22 C86 29 88 38 84 48 C81 47 78 44 76 40 C75 33 76 28 78 22 Z" fill={cutColor} />

          <ellipse cx="50" cy="20" rx="14.8" ry="8.2" fill="none" stroke={colorSecundario} strokeWidth="2.2" />
          <ellipse cx="50" cy="20" rx="12.9" ry="6.4" fill="none" stroke="rgba(255,255,255,0.58)" strokeWidth="0.55" />
          <path d="M23 21 C14 30 11 39 16 49" fill="none" stroke={colorSecundario} strokeWidth="2.1" />
          <path d="M77 21 C86 30 89 39 84 49" fill="none" stroke={colorSecundario} strokeWidth="2.1" />
          <path d="M24.5 22.2 C16 30.2 13.7 38.3 17 47.1" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.55" />
          <path d="M75.5 22.2 C84 30.2 86.3 38.3 83 47.1" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.55" />

          <path d="M34 31 L36 120" stroke="rgba(255,255,255,0.16)" strokeDasharray="1.5 2.5" />
          <path d="M66 31 L64 120" stroke="rgba(255,255,255,0.16)" strokeDasharray="1.5 2.5" />
          <path d="M50 28 L50 120" stroke="rgba(255,255,255,0.07)" />

          {!isBackView ? (
            <>
              <text
                x="50"
                y="43"
                textAnchor="middle"
                fontSize="10.4"
                fontWeight="900"
                fill={colorSecundario}
                style={{ fontStyle: 'italic', letterSpacing: '0.8px' }}
              >
                {wordmark}
              </text>
              <text
                x="50"
                y="92"
                textAnchor="middle"
                fontSize="40"
                fontWeight="900"
                fill={colorSecundario}
                stroke="rgba(10,17,32,0.45)"
                strokeWidth="1.4"
              >
                {jerseyNumber}
              </text>
              <rect x="63" y="109" width="18" height="8" rx="1.5" fill="rgba(10,17,32,0.52)" stroke="rgba(255,255,255,0.22)" />
              <rect x="64.5" y="111.3" width="5.2" height="3.4" fill="#f3f4f6" opacity="0.88" />
            </>
          ) : (
            <>
              <rect x="47.2" y="27.2" width="5.6" height="8.4" rx="1.1" fill="rgba(255,255,255,0.82)" />
              <text
                x="50"
                y="47"
                textAnchor="middle"
                fontSize="8.2"
                fontWeight="900"
                fill={colorSecundario}
                style={{ letterSpacing: '0.9px' }}
              >
                {backName}
              </text>
              <text
                x="50"
                y="93"
                textAnchor="middle"
                fontSize="40"
                fontWeight="900"
                fill={colorSecundario}
                stroke="rgba(10,17,32,0.45)"
                strokeWidth="1.4"
              >
                {jerseyNumber}
              </text>
            </>
          )}

          <path d={bodyShape} fill={`url(#${depthGradientId})`} />
          <path d={bodyShape} fill={`url(#${glossGradientId})`} />
        </svg>
        <div className="absolute bottom-2.5 right-3 text-[8px] font-black uppercase text-white/45 tracking-[0.18em]">
          {JERSEY_PATTERN_LABEL[normalizedPattern]}
        </div>
      </div>
      <span className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em] group-hover:text-cyan-400 transition-colors">{label}</span>
    </div>
  )
}

const TALENTS: TalentConfig[] = [
  {
    key: 'talento_ojo',
    icono: '👁️',
    titulo: 'Ojo Clínico',
    desc: 'Te permite evaluar mejor a los jugadores y tomar decisiones de mercado con más seguridad.',
    foco: 'Scouting y fichajes',
    max: 3,
    accent: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  },
  {
    key: 'talento_lobo',
    icono: '💼',
    titulo: 'Lobo de Wall Street',
    desc: 'Mejora tu capacidad de generar valor económico en las operaciones del club.',
    foco: 'Economía del club',
    max: 5,
    accent: 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  },
  {
    key: 'talento_idolo',
    icono: '🏟️',
    titulo: 'Ídolo Local',
    desc: 'Aumenta tu impacto en la moral y la conexión entre afición y vestuario.',
    foco: 'Moral y entorno',
    max: 3,
    accent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }
];

const ESCUDO_SHAPES: EscudoForma[] = ['classic', 'modern', 'circle', 'hexagon', 'square'];
const JERSEY_PATTERNS = [
  { value: 'solid', label: 'Liso', subtitle: 'Base' },
  { value: 'striped', label: 'Rayas', subtitle: 'Vertical' },
  { value: 'hooped', label: 'Aros', subtitle: 'Horizontal' }
] as const;
type JerseyPattern = (typeof JERSEY_PATTERNS)[number]['value'];

const JERSEY_PATTERN_LABEL: Record<JerseyPattern, string> = {
  solid: 'Liso',
  striped: 'Rayas',
  hooped: 'Aros'
};

const normalizeJerseyPattern = (pattern?: string | null): JerseyPattern => {
  if (pattern === 'striped' || pattern === 'hooped' || pattern === 'solid') return pattern;
  return 'solid';
};

export default function ManagerPage() {
  const [manager, setManager] = useState<ManagerData | null>(null);
  const [club, setClub] = useState<ClubData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<MensajeState>({ tipo: '', texto: '' });
  const [tab, setTab] = useState<'talentos' | 'ajustes'>('talentos'); 
  const [nombreManager, setNombreManager] = useState('');
  const [nombreEquipo, setNombreEquipo] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: mData } = await supabase.from('managers').select('*').eq('owner_id', user.id).single();
      const { data: cData } = await supabase.from('clubes').select('*').eq('owner_id', user.id).single();
      if (mData && cData) {
        const managerData = mData as ManagerData;
        const clubData = cData as ClubData;
        setManager(managerData);
        setNombreManager(String(managerData.nombre || ''));
        setClub(clubData);
        setNombreEquipo(String(clubData.nombre || ''));
      } else {
        window.location.href = '/onboarding';
      }
      setCargando(false);
    };
    loadData();
  }, []);

  const showMsg = (tipo: MensajeState['tipo'], texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 4000);
  };

  const handleUpgradeTalent = async (talentKey: TalentKey) => {
    if (!manager || Number(manager.puntos_talento || 0) <= 0) return;
    const talent = TALENTS.find(t => t.key === talentKey);
    const currentLevel = Number(manager[talentKey] || 0);
    if (talent && currentLevel >= talent.max) return;
    const newLevel = currentLevel + 1;
    const newPoints = Number(manager.puntos_talento || 0) - 1;
    setManager({ ...manager, [talentKey]: newLevel, puntos_talento: newPoints });
    try {
      await supabase.from('managers').update({ [talentKey]: newLevel, puntos_talento: newPoints }).eq('id', manager.id);
      showMsg('success', '¡Talento mejorado!');
    } catch {
      setManager({ ...manager, [talentKey]: currentLevel, puntos_talento: Number(manager.puntos_talento || 0) });
      showMsg('error', 'Error al mejorar talento.');
    }
  };

  const actualizarIdentidad = async () => {
    if (!manager || !club) return;
    const managerName = nombreManager.trim();
    const teamName = nombreEquipo.trim();
    if (!managerName || !teamName) {
      showMsg('error', 'Nombre de manager y equipo obligatorios.');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('managers').update({ nombre: managerName }).eq('owner_id', user.id); 
      await supabase.from('clubes').update({ 
        nombre: teamName,
        color_primario: club.color_primario,
        color_secundario: club.color_secundario,
        jersey_home: club.jersey_home,
        jersey_away: club.jersey_away
      }).eq('owner_id', user.id); 
      showMsg('success', '¡Identidad visual actualizada!');
      setManager({...manager, nombre: managerName});
      setClub({ ...club, nombre: teamName });
    } catch { showMsg('error', 'Error al guardar los ajustes.'); }
  };

  const actualizarPassword = async () => {
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
    if (error) showMsg('error', error.message);
    else { showMsg('success', 'Contraseña cambiada.'); setNuevaPassword(''); }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!club?.id) return;
    try {
      setSubiendo(true);
      const file = e.target.files?.[0];
      if (!file) return;
      const extension = file.name.split('.').pop() || 'png';
      const fileName = `${club.id}/${Date.now()}-${Math.random()}.${extension}`;
      await supabase.storage.from('escudos').upload(fileName, file);
      const { data: { publicUrl } } = supabase.storage.from('escudos').getPublicUrl(fileName);
      await supabase.from('clubes').update({ escudo_url: publicUrl }).eq('id', club.id); 
      setClub({ ...club, escudo_url: publicUrl });
      showMsg('success', 'Logo actualizado.');
    } catch { showMsg('error', 'Error al subir.'); }
    finally { setSubiendo(false); }
  };

  const handleRemoveLogo = async () => {
    if (!club) return;
    await supabase.from('clubes').update({ escudo_url: null }).eq('id', club.id);
    setClub({ ...club, escudo_url: null });
    showMsg('success', 'Logo eliminado.');
  };

  if (cargando) return <div className="p-20 text-center font-black text-cyan-500 animate-pulse uppercase tracking-widest">Cargando Perfil...</div>;
  if (!manager || !club) return <div className="p-20 text-center font-black text-red-400 uppercase tracking-widest">No se pudo cargar el perfil del manager</div>;

  const xpActual = manager?.xp || 0;
  const xpSiguiente = manager?.xp_siguiente || 1000;
  const xpPercent = Math.min(100, Math.round((xpActual / Math.max(1, xpSiguiente)) * 100));
  const xpFaltante = Math.max(0, xpSiguiente - xpActual);
  const victorias = manager?.victorias || 0;
  const derrotas = manager?.derrotas || 0;
  const totalPartidos = victorias + derrotas;
  const ratioVictoria = totalPartidos > 0 ? Math.round((victorias / totalPartidos) * 100) : 0;
  const puntosTalento = manager?.puntos_talento || 0;
  const talentosTotales = TALENTS.reduce((acc, talent) => acc + Number(manager?.[talent.key] || 0), 0);
  const maxTalentos = TALENTS.reduce((acc, talent) => acc + talent.max, 0);
  const progresoTalentos = Math.round((talentosTotales / Math.max(1, maxTalentos)) * 100);

  return (
    <div className="p-5 md:p-9 pb-28 max-w-7xl mx-auto space-y-7 animate-in fade-in duration-700">
      
      {mensaje.texto && (
        <div className={`fixed bottom-6 right-6 z-[100] p-4 rounded-2xl border flex items-center gap-3 shadow-2xl animate-in slide-in-from-right-10 ${mensaje.tipo === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          <span className="text-xs font-black uppercase tracking-widest">{mensaje.texto}</span>
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-[2.6rem] border border-white/10 p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-8 right-10 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-12 left-12 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative grid gap-7 lg:grid-cols-[220px_1fr] lg:items-center">
          <div className="space-y-4">
            <div className="mx-auto w-32 h-32 rounded-[2rem] border border-cyan-500/35 bg-slate-950/80 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.18)]">
              <EscudoRender forma={club?.escudo_forma} color={club?.color_primario} logoUrl={club?.escudo_url} className="w-24 h-24" />
            </div>
            <div className="mx-auto w-24 h-24 bg-slate-950 rounded-full border-4 border-cyan-500 flex items-center justify-center shadow-[0_0_24px_rgba(6,182,212,0.28)]">
              <span className="text-4xl font-black italic text-white">{manager?.nivel || 1}</span>
            </div>
            <div className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">Nivel de manager</div>
          </div>
          <div className="z-10 space-y-5 text-center lg:text-left">
            <div className="space-y-1">
              <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.26em]">Manager del club</p>
              <h1 className="text-3xl md:text-5xl font-black italic uppercase tracking-tight text-white">{manager?.nombre}</h1>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Al mando de <span className="text-white">{club?.nombre}</span>
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 md:p-5">
              <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest mb-2">
                <span className="text-slate-400">Progreso XP</span>
                <span className="text-cyan-300">{xpActual} / {xpSiguiente}</span>
              </div>
              <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-white/10">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700" style={{ width: `${xpPercent}%` }}></div>
              </div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Faltan <span className="text-white">{xpFaltante}</span> XP para el siguiente nivel
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ManagerStatCard icon={<Sparkles size={14} />} label="Puntos Talento" value={puntosTalento} accent="text-orange-300" />
              <ManagerStatCard icon={<TrendingUp size={14} />} label="Win Rate" value={`${ratioVictoria}%`} accent="text-emerald-300" />
              <ManagerStatCard icon={<Coins size={14} />} label="Victorias" value={victorias} accent="text-cyan-300" />
              <ManagerStatCard icon={<Crown size={14} />} label="Títulos" value={manager?.titulos || 0} accent="text-yellow-300" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex bg-slate-900/70 p-2 rounded-2xl border border-white/10 max-w-md mx-auto">
        <button onClick={() => setTab('talentos')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'talentos' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
          <Award size={16} className="inline mr-2" /> Talentos
        </button>
        <button onClick={() => setTab('ajustes')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'ajustes' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
          <Settings2 size={16} className="inline mr-2" /> Ajustes
        </button>
      </div>

      {tab === 'talentos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-slate-900 rounded-[2rem] border border-white/10 p-6 space-y-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <Target size={14} />
                <h3 className="text-xs font-black uppercase tracking-[0.16em]">Estado del manager</h3>
              </div>
              <div className="space-y-3">
                <ProgressRow label="Talentos desbloqueados" value={`${talentosTotales}/${maxTalentos}`} progress={progresoTalentos} />
                <ProgressRow label="Camino al siguiente nivel" value={`${xpPercent}%`} progress={xpPercent} />
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-300">
                Los puntos de talento se invierten aquí en el momento. La XP y el nivel se actualizan desde la lógica del juego.
              </div>
            </div>

            <div className="bg-slate-900 rounded-[2rem] border border-white/10 p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <Sparkles size={14} />
                <h3 className="text-xs font-black uppercase tracking-[0.16em]">Acciones recomendadas</h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <QuickLink href="/market" title="Mercado" subtitle="Aprovecha Ojo Clínico" />
                <QuickLink href="/training" title="Training" subtitle="Sostén la forma del quinteto" />
                <QuickLink href="/calendar" title="Calendario" subtitle="Planifica rotaciones y ritmo" />
              </div>
            </div>
          </div>
          <div className="lg:col-span-8 space-y-4">
             <div className="flex justify-between items-center rounded-2xl border border-white/10 bg-slate-900 p-4">
                <h3 className="text-sm font-black text-white uppercase tracking-[0.16em]">Árbol de talentos</h3>
                <span className={`font-black uppercase text-xs px-3 py-1 rounded-full border ${puntosTalento > 0 ? 'text-orange-300 border-orange-400/40 bg-orange-500/10' : 'text-slate-400 border-white/10 bg-slate-800/50'}`}>
                  Puntos disponibles: {puntosTalento}
                </span>
             </div>
             {TALENTS.map((talent) => (
               <TalentCard
                 key={talent.key}
                 icono={talent.icono}
                 titulo={talent.titulo}
                 desc={talent.desc}
                 foco={talent.foco}
                 nivel={manager?.[talent.key] || 0}
                 max={talent.max}
                 ptos={puntosTalento}
                 accent={talent.accent}
                 onUpgrade={() => handleUpgradeTalent(talent.key)}
               />
             ))}
          </div>
        </div>
      )}

      {tab === 'ajustes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-[2.5rem] border border-white/5 p-8 space-y-6 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4"><User className="text-cyan-400" /><h2 className="text-sm font-black uppercase text-white tracking-widest">Ajustes de Identidad</h2></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Firma Manager</label><input value={nombreManager} onChange={e => setNombreManager(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-bold text-white focus:border-cyan-500 outline-none" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Franquicia</label><input value={nombreEquipo} onChange={e => setNombreEquipo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-bold text-orange-500 focus:border-orange-500 outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Color Primario</label>
                  <div className="flex gap-3 items-center bg-slate-950 p-2 rounded-xl border border-white/5">
                    <input type="color" value={club?.color_primario || '#3b82f6'} onChange={e => setClub({...club, color_primario: e.target.value})} className="w-10 h-10 bg-transparent rounded-lg cursor-pointer" />
                    <span className="text-xs font-mono font-bold text-white uppercase">{club?.color_primario}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Color Secundario</label>
                  <div className="flex gap-3 items-center bg-slate-950 p-2 rounded-xl border border-white/5">
                    <input type="color" value={club?.color_secundario || '#1e293b'} onChange={e => setClub({...club, color_secundario: e.target.value})} className="w-10 h-10 bg-transparent rounded-lg cursor-pointer" />
                    <span className="text-xs font-mono font-bold text-white uppercase">{club?.color_secundario}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-white/5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Palette size={12}/> Patrones de Equipación</label>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  Elige la trama local y visitante con previsualización instantánea.
                </p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 bg-slate-950/40 p-5 rounded-[2rem] border border-white/5">
                  <div className="space-y-4 bg-slate-950/50 rounded-2xl border border-white/10 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Home</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{JERSEY_PATTERN_LABEL[normalizeJerseyPattern(club?.jersey_home)]}</span>
                    </div>
                    <JerseyPreview
                      colorPrimario={club?.color_primario || '#3b82f6'}
                      colorSecundario={club?.color_secundario || '#1e293b'}
                      pattern={club?.jersey_home}
                      label="Home"
                      teamName={club?.nombre}
                      managerName={manager?.nombre}
                    />
                    <select
                      value={normalizeJerseyPattern(club?.jersey_home)}
                      onChange={(e) => setClub({ ...club, jersey_home: e.target.value })}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl text-[11px] font-black p-2.5 uppercase outline-none focus:border-cyan-500 tracking-wider"
                    >
                      {JERSEY_PATTERNS.map((pattern) => (
                        <option key={pattern.value} value={pattern.value}>
                          {pattern.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-4 bg-slate-950/50 rounded-2xl border border-white/10 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">Away</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{JERSEY_PATTERN_LABEL[normalizeJerseyPattern(club?.jersey_away)]}</span>
                    </div>
                    <JerseyPreview
                      colorPrimario={club?.color_secundario || '#1e293b'}
                      colorSecundario={club?.color_primario || '#3b82f6'}
                      pattern={club?.jersey_away}
                      label="Away"
                      teamName={club?.nombre}
                      managerName={manager?.nombre}
                    />
                    <select
                      value={normalizeJerseyPattern(club?.jersey_away)}
                      onChange={(e) => setClub({ ...club, jersey_away: e.target.value })}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl text-[11px] font-black p-2.5 uppercase outline-none focus:border-cyan-500 tracking-wider"
                    >
                      {JERSEY_PATTERNS.map((pattern) => (
                        <option key={pattern.value} value={pattern.value}>
                          {pattern.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={actualizarIdentidad} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase text-xs rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95"><Save size={16} /> Aplicar Ajustes Visuales</button>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-[2.5rem] border border-white/5 p-8 space-y-6 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4"><Settings2 className="text-slate-400" /> <h2 className="text-sm font-black uppercase text-white tracking-widest">Escudo & Logo</h2></div>
              <div className="flex items-center gap-8 bg-slate-950/50 p-6 rounded-3xl border border-white/5 relative shadow-inner">
                 <EscudoRender forma={club?.escudo_forma} color={club?.color_primario} logoUrl={club?.escudo_url} className="w-24 h-24" />
                 <div className="grid grid-cols-3 gap-2 flex-1">
                   {ESCUDO_SHAPES.map(f => (
                     <button key={f} onClick={() => setClub({...club, escudo_forma: f})} className={`p-2 rounded-xl border-2 transition-all ${club?.escudo_forma === f ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}>
                       <EscudoRender forma={f} color={club?.color_primario} className="w-6 h-6 mx-auto opacity-50" />
                     </button>
                   ))}
                 </div>
              </div>
              <div className="flex gap-2 justify-center pt-2">
                 <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 text-white">
                   <Upload size={14} /> {subiendo ? 'Subiendo...' : 'Cambiar Logo'}
                   <input type="file" className="hidden" onChange={handleUploadLogo} disabled={subiendo} accept="image/*" />
                 </label>
                 {club?.escudo_url && <button onClick={handleRemoveLogo} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2"><Trash2 size={14} /> Eliminar</button>}
              </div>
            </div>
            <div className="bg-slate-900 rounded-[2.5rem] border border-white/5 p-8 space-y-6 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4"><Lock className="text-red-500" /><h2 className="text-sm font-black uppercase text-white tracking-widest">Seguridad</h2></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nueva Contraseña</label><input type="password" value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-mono text-white focus:border-red-500 outline-none" /></div>
              <button onClick={actualizarPassword} disabled={nuevaPassword.length < 6} className="w-full py-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white font-black uppercase text-[10px] rounded-xl border border-red-600/20 transition-all disabled:opacity-20">Actualizar Credenciales</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ManagerStatCardProps = { icon: React.ReactNode; label: string; value: string | number; accent: string; };
type ProgressRowProps = { label: string; value: string; progress: number; };
type QuickLinkProps = { href: string; title: string; subtitle: string; };
type TalentCardProps = {
  icono: string;
  titulo: string;
  desc: string;
  foco: string;
  nivel: number;
  max: number;
  ptos: number;
  accent: string;
  onUpgrade: () => void;
};

function ManagerStatCard({ icon, label, value, accent }: ManagerStatCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-left">
      <div className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${accent}`}>
        {icon}
        {label}
      </div>
      <div className="text-xl md:text-2xl font-black text-white mt-1">{value}</div>
    </div>
  );
}

function ProgressRow({ label, value, progress }: ProgressRowProps) {
  const width = Math.max(0, Math.min(100, progress || 0));
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">
        <span>{label}</span>
        <span className="text-white">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-950 border border-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500" style={{ width: `${width}%` }}></div>
      </div>
    </div>
  );
}

function QuickLink({ href, title, subtitle }: QuickLinkProps) {
  return (
    <a href={href} className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 hover:border-cyan-500/40 transition-colors">
      <div className="text-xs font-black uppercase tracking-wider text-white">{title}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{subtitle}</div>
    </a>
  );
}

function TalentCard({ icono, titulo, desc, foco, nivel, max, ptos, accent, onUpgrade }: TalentCardProps) {
  const isMaxed = nivel >= max;
  const canUpgrade = ptos > 0 && !isMaxed;
  const progress = Math.round((nivel / Math.max(1, max)) * 100);
  return (
    <div className="bg-slate-900 p-5 md:p-6 rounded-2xl border border-white/10 group hover:border-cyan-500/30 transition-colors">
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-xl border flex items-center justify-center text-2xl shrink-0 shadow-inner ${accent}`}>{icono}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <h4 className="text-sm font-black uppercase text-white tracking-wide">{titulo}</h4>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nivel {nivel}/{max}</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{desc}</p>
          <div className="mt-3 space-y-1">
            <div className="h-2 rounded-full bg-slate-950 border border-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${isMaxed ? 'bg-emerald-400' : 'bg-cyan-400'}`} style={{ width: `${progress}%` }}></div>
            </div>
            <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-slate-500">
              <span>{foco}</span>
              <span>{isMaxed ? 'Talento al máximo' : 'Coste: 1 punto'}</span>
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <button onClick={onUpgrade} disabled={!canUpgrade} className={`w-12 h-12 rounded-xl font-black text-sm transition-all flex items-center justify-center ${canUpgrade ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer active:scale-95' : 'bg-slate-950 text-slate-600 cursor-not-allowed'}`}>
            {isMaxed ? 'MAX' : '+1'}
          </button>
        </div>
      </div>
    </div>
  );
}
