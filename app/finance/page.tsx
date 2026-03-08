'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import {
  calculateSponsorshipAndFansIncome,
  fetchEconomyRules,
  getDefaultEconomyByLevel,
  getLeagueEconomy,
  type LeagueEconomyByLevel
} from '@/lib/economy-balance';
import { 
  ArrowLeft, Activity, AlertTriangle, Landmark, CalendarDays, Wallet, Clock
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LeagueInfo = { nivel?: number; };
type ClubData = {
  id: string;
  owner_id?: string;
  league_id?: number | null;
  presupuesto: number;
  fan_mood?: number | null;
  ligas?: LeagueInfo | null;
  [key: string]: unknown;
};
type FinanceTransaction = {
  id: number;
  team_id: string;
  concepto?: string | null;
  monto: number;
  tipo: 'INGRESO' | 'GASTO' | string;
  fecha?: string | null;
  created_at?: string | null;
};

export default function FinancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [club, setClub] = useState<ClubData | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [masaSalarial, setMasaSalarial] = useState(0);
  const [economyByLevel, setEconomyByLevel] = useState<LeagueEconomyByLevel>(getDefaultEconomyByLevel());

  const loadFinanceData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: clubData, error: clubError } = await supabase
        .from('clubes')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();
      
      if (clubError) console.error("Error BD Club:", clubError);

      if (!clubData) {
        setLoading(false);
        return;
      }

      const [playersRes, ligasRes, dynamicEconomyByLevel] = await Promise.all([
        supabase.from('players').select('overall').eq('team_id', clubData.id),
        clubData.league_id ? supabase.from('ligas').select('*').eq('id', clubData.league_id).maybeSingle() : Promise.resolve({ data: null }),
        fetchEconomyRules(supabase)
      ]);

      // Compatibilidad de esquema: en esta BD la fecha de transacción es `fecha` (no `created_at`).
      const transByFecha = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('team_id', clubData.id)
        .order('fecha', { ascending: false });

      const transRes = transByFecha.error
        ? await supabase
            .from('finance_transactions')
            .select('*')
            .eq('team_id', clubData.id)
            .order('created_at', { ascending: false })
        : transByFecha;

      if (transRes.error) {
        console.warn('No se pudieron cargar transacciones financieras:', transRes.error);
      }

      const totalSalarios = playersRes.data?.reduce(
        (acc: number, p: { overall: number }) => acc + getWeeklySalaryByOvr(p.overall || 0),
        0
      ) || 0;
      
      setClub({ ...clubData, ligas: ligasRes.data });
      setMasaSalarial(totalSalarios);
      setTransactions(transRes.data || []);
      setEconomyByLevel(dynamicEconomyByLevel);

    } catch (e) {
      console.error("Error financiero general:", e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadFinanceData();
  }, [loadFinanceData]);

  const getNextUpdateDate = () => {
    const now = new Date();
    const nextFriday = new Date();
    nextFriday.setDate(now.getDate() + (5 + 7 - now.getDay()) % 7);
    nextFriday.setHours(1, 0, 0, 0);

    if (nextFriday <= now) {
      nextFriday.setDate(nextFriday.getDate() + 7);
    }

    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    }).format(nextFriday);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-mono">
      <Activity className="text-emerald-500 animate-pulse w-12 h-12 mb-4" />
      <p className="text-slate-500 text-[10px] uppercase tracking-widest text-center">Generando informe contable...</p>
    </div>
  );

  if (!club) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-mono">
      <AlertTriangle className="text-red-500 w-16 h-16 mb-6 opacity-20" />
      <h2 className="text-2xl font-black uppercase text-white mb-2 tracking-tighter">Fallo de Auditoría</h2>
      <p className="text-slate-500 text-sm max-w-xs mb-8 font-bold italic">No hay datos financieros vinculados a tu cuenta.</p>
      <Link href="/" className="px-8 py-3 bg-slate-900 border border-white/10 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all">Revisar Perfil</Link>
    </div>
  );

  const formatCurrency = (amount: number) => new Intl.NumberFormat('es-ES').format(amount) + ' €';
  const nivelLiga = club.ligas?.nivel || 1;

  const economy = getLeagueEconomy(nivelLiga, economyByLevel);
  const estIngresosFijos = calculateSponsorshipAndFansIncome(nivelLiga, COALESCE(club.fan_mood, 50), economyByLevel);
  const estTaquillas = economy.ticketRevenueBase;
  
  const estMantenimiento = economy.venueMaintenance;
  const estSueldos = masaSalarial;

  const totalIngresosEst = estIngresosFijos + estTaquillas;
  const totalGastosEst = estSueldos + estMantenimiento;

  const fechaHaceUnaSemana = new Date();
  fechaHaceUnaSemana.setDate(fechaHaceUnaSemana.getDate() - 7);
  const transLastWeek = transactions.filter((t) => {
    const txDate = t.fecha || t.created_at;
    if (!txDate) return false;
    const parsed = new Date(txDate);
    return !Number.isNaN(parsed.getTime()) && parsed >= fechaHaceUnaSemana;
  });

  const gastoGimnasio = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      const isGym = concept.includes('entrenamiento') || concept.includes('fisio');
      return t.tipo === 'GASTO' && isGym;
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const gastoMercado = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      const isMarket = concept.includes('mercado') || concept.includes('ojeo') || concept.includes('fichaje');
      return t.tipo === 'GASTO' && isMarket;
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const ingresoMercado = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      const isMarketIncome = concept.includes('mercado') || concept.includes('venta') || concept.includes('traspaso');
      return t.tipo === 'INGRESO' && isMarketIncome;
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);
  
  const ingresoPatrocinadores = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      return t.tipo === 'INGRESO' && (concept.includes('patrocinadores') || concept.includes('socios'));
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const ingresoTaquillas = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      return t.tipo === 'INGRESO' && (concept.includes('taquillas') || concept.includes('entradas'));
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const gastoSueldos = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      return t.tipo === 'GASTO' && (concept.includes('salarios') || concept.includes('sueldos') || concept.includes('plantilla'));
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const gastoMantenimiento = transLastWeek
    .filter((t) => {
      const concept = String(t.concepto || '').toLowerCase();
      return t.tipo === 'GASTO' && (concept.includes('mantenimiento') || concept.includes('pabellón'));
    })
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const realIngresos = transLastWeek
    .filter(t => t.tipo === 'INGRESO')
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);
  const realGastos = transLastWeek
    .filter(t => t.tipo === 'GASTO')
    .reduce((acc, t) => acc + Math.abs(Number(t.monto || 0)), 0);

  const beneficioAnterior = realIngresos - realGastos;
  // Previsión: Solo ingresos y gastos fijos/recurrentes. Excluimos mercado y gimnasio (variables).
  // FIX: Aseguramos que no se proyecten gastos únicos en la previsión futura.
  const totalIngresosEstConExtras = totalIngresosEst;
  const totalGastosEstConExtras = totalGastosEst;
  const beneficioEsperadoConGym = totalIngresosEstConExtras - totalGastosEstConExtras;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 relative overflow-hidden font-mono">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
          <div>
            <Link href="/" className="text-slate-500 hover:text-white flex items-center gap-2 mb-4 text-[10px] font-black uppercase tracking-widest transition-colors">
              <ArrowLeft size={14}/> Volver al Despacho
            </Link>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white">
              Estado de <span className="text-emerald-500">Cuentas</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 bg-slate-900 border border-white/10 px-6 py-4 rounded-2xl shadow-xl">
            <Landmark className="text-slate-600" size={24} />
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Presupuesto Actual</p>
              <p className={`text-2xl font-mono font-black ${club.presupuesto < 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                {formatCurrency(club.presupuesto)}
              </p>
            </div>
          </div>
        </header>

        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-4 flex items-center gap-4 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
          <div className="w-10 h-10 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center shrink-0">
            <Clock size={20} className="animate-spin-slow" />
          </div>
          <div>
            <p className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">Próximo Cierre Semanal y Pago de Salarios</p>
            <p className="text-sm font-bold text-white capitalize">{getNextUpdateDate()}</p>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
          <div className="bg-white/5 px-8 py-4 flex items-center gap-3 border-b border-white/5">
            <CalendarDays className="text-cyan-500" size={20} />
            <h2 className="text-lg font-black uppercase tracking-widest text-white">Previsión Semanal</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
            <div className="p-8 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-6 flex justify-between border-b border-emerald-500/20 pb-2">
                <span>Ingresos Est.</span>
              </h3>
              <div className="space-y-3">
                <Row label="Patrocinadores y Socios" value={estIngresosFijos} />
                <Row label="Taquillas y Entradas" value={estTaquillas} />
              </div>
            </div>
            <div className="p-8 space-y-4 bg-slate-950/20">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400 mb-6 flex justify-between border-b border-red-500/20 pb-2">
                <span>Gastos Est.</span>
              </h3>
              <div className="space-y-3">
                <Row label="Sueldos de Plantilla" value={estSueldos} isExpense />
                <Row label="Mantenimiento Pabellón" value={estMantenimiento} isExpense />
              </div>
            </div>
          </div>

          <div className={`px-8 py-6 flex justify-between items-center border-t border-white/5 ${beneficioEsperadoConGym >= 0 ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
             <span className="text-sm font-black uppercase tracking-widest text-white">Beneficio Neto Esperado</span>
             <span className={`text-2xl font-mono font-black ${beneficioEsperadoConGym >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
               {beneficioEsperadoConGym >= 0 ? '+' : ''}{formatCurrency(beneficioEsperadoConGym)}
             </span>
          </div>
        </div>

        <div className="bg-slate-900/30 border border-white/5 rounded-[2rem] overflow-hidden shadow-lg opacity-80 hover:opacity-100 transition-opacity">
          <div className="bg-white/5 px-8 py-4 flex items-center gap-3 border-b border-white/5">
            <Wallet className="text-slate-400" size={20} />
            <h2 className="text-lg font-black uppercase tracking-widest text-slate-300">Balance Semana Anterior</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
            <div className="p-8 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-500/70 mb-6 flex justify-between border-b border-emerald-500/10 pb-2">
                <span>Ingresos Reales</span>
              </h3>
              <div className="space-y-3">
                <Row label="Patrocinadores y Socios" value={ingresoPatrocinadores} />
                <Row label="Taquillas y Entradas" value={ingresoTaquillas} />
                <Row label="Mercado (Ventas)" value={ingresoMercado} />
              </div>
            </div>
            <div className="p-8 space-y-4 bg-slate-950/20">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400/70 mb-6 flex justify-between border-b border-red-500/10 pb-2">
                <span>Gastos Reales</span>
              </h3>
              <div className="space-y-3">
                <Row label="Sueldos de Plantilla" value={gastoSueldos} isExpense />
                <Row label="Mantenimiento Pabellón" value={gastoMantenimiento} isExpense />
                <Row label="Gimnasio" value={gastoGimnasio} isExpense />
                <Row label="Mercado" value={gastoMercado} isExpense />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border-t border-white/5 px-8 py-6 flex justify-between items-center">
             <span className="text-xs font-black uppercase tracking-widest text-slate-400">Resultado Consolidado</span>
             <span className={`text-xl font-mono font-bold ${beneficioAnterior >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
               {beneficioAnterior >= 0 ? '+' : ''}{formatCurrency(beneficioAnterior)}
             </span>
          </div>
        </div>

      </div>
    </div>
  );
}

function Row({ label, value, isExpense = false }: { label: string, value: number, isExpense?: boolean }) {
  return (
    <div className="flex justify-between items-end border-b border-white/5 border-dashed pb-2 group hover:border-white/20 transition-colors">
      <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300 transition-colors">{label}</span>
      <span className={`text-sm font-mono ${value === 0 ? 'text-slate-600' : isExpense ? 'text-red-400/80' : 'text-emerald-400'}`}>
        {isExpense && value > 0 ? '-' : ''}{new Intl.NumberFormat('es-ES').format(value)} €
      </span>
    </div>
  );
}

function COALESCE<T>(val: T | null | undefined, def: T) {
  return val === null || val === undefined ? def : val;
}
