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

const MADRID_TZ = 'Europe/Madrid';
const WEEKLY_CLOSE_DAY = 5; // Friday
const WEEKLY_CLOSE_HOUR = 1;
const ONE_HOUR_MS = 1000 * 60 * 60;

const getTransactionTimeMs = (tx: FinanceTransaction) => {
  const rawDate = tx.fecha || tx.created_at;
  if (!rawDate) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(rawDate).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const sortTransactionsByNewest = (a: FinanceTransaction, b: FinanceTransaction) => {
  const aTime = getTransactionTimeMs(a);
  const bTime = getTransactionTimeMs(b);
  if (aTime === bTime) return b.id - a.id;
  if (!Number.isFinite(aTime)) return 1;
  if (!Number.isFinite(bTime)) return -1;
  return bTime - aTime;
};

const normalizeConcept = (concept?: string | null) =>
  (concept || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const txConceptIncludesAny = (tx: FinanceTransaction, needles: string[]) => {
  const concept = normalizeConcept(tx.concepto);
  return needles.some((needle) => concept.includes(needle));
};

const txType = (tx: FinanceTransaction) => (tx.tipo || '').toUpperCase();
const isExpenseTx = (tx: FinanceTransaction) => txType(tx) === 'GASTO';
const isIncomeTx = (tx: FinanceTransaction) => txType(tx) === 'INGRESO';

const RECURRING_SALARY_TOKENS = ['salari', 'sueldo', 'nomina', 'plantilla'];
const RECURRING_MAINTENANCE_TOKENS = ['manten', 'pabell', 'instalacion'];
const RECURRING_SPONSOR_TOKENS = ['patrocin', 'socio', 'sponsor', 'abonad'];
const RECURRING_TICKET_TOKENS = ['taquill', 'entrada', 'ticket'];
const RECURRING_ALL_TOKENS = [
  ...RECURRING_SALARY_TOKENS,
  ...RECURRING_MAINTENANCE_TOKENS,
  ...RECURRING_SPONSOR_TOKENS,
  ...RECURRING_TICKET_TOKENS
];
const FIXED_LAST_WEEK_SPONSORS = 300_000;
const FIXED_LAST_WEEK_TICKETS = 250_000;

const getNowInMadrid = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
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
        clubData.league_id
          ? supabase.from('ligas').select('nivel').eq('id', clubData.league_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        fetchEconomyRules(supabase)
      ]);

      if (playersRes.error) {
        console.warn('No se pudo cargar plantilla para cálculo salarial:', playersRes.error);
      }
      if (ligasRes.error) {
        console.warn('No se pudo cargar nivel de liga. Se usará nivel 1:', ligasRes.error);
      }

      // Compatibilidad de esquema: en esta BD la fecha de transacción es `fecha` (no `created_at`).
      const transByFecha = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('team_id', clubData.id)
        .order('fecha', { ascending: false, nullsFirst: false });

      const transRes = transByFecha.error
        ? await supabase
            .from('finance_transactions')
            .select('*')
            .eq('team_id', clubData.id)
            .order('created_at', { ascending: false, nullsFirst: false })
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
      setTransactions([...(transRes.data || [])].sort(sortTransactionsByNewest));
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
    const nowMadrid = getNowInMadrid();
    const nextFriday = new Date(nowMadrid);
    nextFriday.setDate(nowMadrid.getDate() + (WEEKLY_CLOSE_DAY + 7 - nowMadrid.getDay()) % 7);
    nextFriday.setHours(WEEKLY_CLOSE_HOUR, 0, 0, 0);

    if (nextFriday <= nowMadrid) {
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
  const estIngresosFijos = calculateSponsorshipAndFansIncome(nivelLiga, club.fan_mood ?? 50, economyByLevel);
  const estTaquillas = economy.ticketRevenueBase;
  
  const estMantenimiento = economy.venueMaintenance;
  const estSueldos = masaSalarial;

  const totalIngresosEst = estIngresosFijos + estTaquillas;
  const totalGastosEst = estSueldos + estMantenimiento;

  // --- LOGICA DE CICLOS SEMANALES ---
  // Priorizamos separar por cierres semanales y, si faltan, caemos a ventana temporal.
  const isCloseTx = (tx: FinanceTransaction) => {
    const concept = normalizeConcept(tx.concepto);
    if (!concept) return false;

    const hasWeeklyMarker =
      concept.includes('semanal') ||
      concept.includes('semana') ||
      concept.includes('cierre');
    const hasFinanceActionWord =
      concept.includes('pago') ||
      concept.includes('ingreso') ||
      concept.includes('gasto');

    const hasWeeklyCategory = RECURRING_ALL_TOKENS.some((token) => concept.includes(token));

    return hasWeeklyCategory && (hasWeeklyMarker || hasFinanceActionWord);
  };

  const splitTransactionsByWeeklyCloseCutoff = (txs: FinanceTransaction[]) => {
    const nowMadrid = getNowInMadrid();
    const lastClose = new Date(nowMadrid);
    lastClose.setHours(WEEKLY_CLOSE_HOUR, 0, 0, 0);

    const daysSinceCloseDay = (nowMadrid.getDay() - WEEKLY_CLOSE_DAY + 7) % 7;
    lastClose.setDate(nowMadrid.getDate() - daysSinceCloseDay);
    if (daysSinceCloseDay === 0 && nowMadrid.getTime() < lastClose.getTime()) {
      lastClose.setDate(lastClose.getDate() - 7);
    }

    const prevClose = new Date(lastClose);
    prevClose.setDate(prevClose.getDate() - 7);

    const lastCloseMs = lastClose.getTime();
    const prevCloseMs = prevClose.getTime();

    return txs.reduce<{
      currentWeekTxs: FinanceTransaction[];
      lastWeekTxs: FinanceTransaction[];
    }>(
      (acc, tx) => {
        const txTime = getTransactionTimeMs(tx);
        if (!Number.isFinite(txTime)) return acc;

        if (txTime > lastCloseMs) {
          acc.currentWeekTxs.push(tx);
        } else if (txTime > prevCloseMs && txTime <= lastCloseMs) {
          // El cierre semanal (justo en el corte) pertenece a la semana anterior.
          acc.lastWeekTxs.push(tx);
        }

        return acc;
      },
      { currentWeekTxs: [], lastWeekTxs: [] }
    );
  };

  const boundaryIndex = transactions.findIndex(isCloseTx);
  let currentWeekTxs: FinanceTransaction[] = [];
  let lastWeekTxs: FinanceTransaction[] = [];

  if (boundaryIndex !== -1) {
    const firstCloseTime = getTransactionTimeMs(transactions[boundaryIndex]);

    if (Number.isFinite(firstCloseTime)) {
      let secondBoundaryIndex = transactions.length;
      for (let i = boundaryIndex + 1; i < transactions.length; i++) {
        if (!isCloseTx(transactions[i])) continue;
        const thisTime = getTransactionTimeMs(transactions[i]);
        // Si hay mas de 1 hora de diferencia, asumimos que es el cierre de la semana anterior.
        if (Number.isFinite(thisTime) && Math.abs(firstCloseTime - thisTime) > ONE_HOUR_MS) {
          secondBoundaryIndex = i;
          break;
        }
      }

      currentWeekTxs = transactions.slice(0, boundaryIndex);
      lastWeekTxs = transactions.slice(boundaryIndex, secondBoundaryIndex);
    }
  }

  if (boundaryIndex === -1 || (currentWeekTxs.length === 0 && lastWeekTxs.length === 0)) {
    const fallbackWeeks = splitTransactionsByWeeklyCloseCutoff(transactions);
    currentWeekTxs = fallbackWeeks.currentWeekTxs;
    lastWeekTxs = fallbackWeeks.lastWeekTxs;
  }

  const lastWeekIds = new Set(lastWeekTxs.map((tx) => tx.id));
  const closeTxs = transactions.filter((tx) => isCloseTx(tx) && Number.isFinite(getTransactionTimeMs(tx)));
  let recurringTopUpTxs: FinanceTransaction[] = [];
  if (closeTxs.length > 0) {
    const latestCloseTime = Math.max(...closeTxs.map(getTransactionTimeMs));
    const clusterStart = latestCloseTime - ONE_HOUR_MS;
    const clusterEnd = latestCloseTime + ONE_HOUR_MS;

    recurringTopUpTxs = transactions.filter((tx) => {
      const txTime = getTransactionTimeMs(tx);
      if (!Number.isFinite(txTime)) return false;
      if (txTime < clusterStart || txTime > clusterEnd) return false;
      return txConceptIncludesAny(tx, RECURRING_ALL_TOKENS);
    });
  }

  const lastWeekTxsWithRecurring = [
    ...lastWeekTxs,
    ...recurringTopUpTxs.filter((tx) => !lastWeekIds.has(tx.id))
  ].sort(sortTransactionsByNewest);

  // 1. Previsión Semanal (Semana en curso)
  const currentGym = currentWeekTxs
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, ['entrenamiento', 'fisio']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const currentMarketExpense = currentWeekTxs
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, ['mercado', 'fichaje']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const currentMarketIncome = currentWeekTxs
    .filter((t) => isIncomeTx(t) && txConceptIncludesAny(t, ['mercado', 'venta']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);

  const totalIngresosEstConExtras = totalIngresosEst + currentMarketIncome;
  const totalGastosEstConExtras = totalGastosEst + currentGym + currentMarketExpense;
  const beneficioEsperadoConGym = totalIngresosEstConExtras - totalGastosEstConExtras;

  // 2. Balance Semana Anterior (Semana cerrada)
  const lastSueldos = lastWeekTxsWithRecurring
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, RECURRING_SALARY_TOKENS))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const lastMantenimiento = lastWeekTxsWithRecurring
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, RECURRING_MAINTENANCE_TOKENS))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const lastConsolidado = lastWeekTxsWithRecurring
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, ['cierre semanal']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const lastGym = lastWeekTxsWithRecurring
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, ['entrenamiento', 'fisio']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const lastMarketExpense = lastWeekTxsWithRecurring
    .filter((t) => isExpenseTx(t) && txConceptIncludesAny(t, ['mercado', 'fichaje']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  
  const lastSponsors = lastWeekTxsWithRecurring
    .filter((t) => isIncomeTx(t) && txConceptIncludesAny(t, RECURRING_SPONSOR_TOKENS))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const lastTickets = lastWeekTxsWithRecurring
    .filter((t) => isIncomeTx(t) && txConceptIncludesAny(t, RECURRING_TICKET_TOKENS))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const lastMarketIncome = lastWeekTxsWithRecurring
    .filter((t) => isIncomeTx(t) && txConceptIncludesAny(t, ['mercado', 'venta']))
    .reduce((acc, t) => acc + Math.abs(t.monto), 0);

  // Si el bloque semanal viene incompleto desde BD, rellenamos recurrentes con la economía fija.
  const hasAnyLastWeekRecurring =
    lastSueldos > 0 ||
    lastMantenimiento > 0 ||
    lastSponsors > 0 ||
    lastTickets > 0;

  const safeLastSueldos =
    hasAnyLastWeekRecurring && lastSueldos === 0 ? estSueldos : lastSueldos;
  const safeLastMantenimiento =
    hasAnyLastWeekRecurring && lastMantenimiento === 0 ? estMantenimiento : lastMantenimiento;
  const safeLastSponsors = FIXED_LAST_WEEK_SPONSORS;
  const safeLastTickets = FIXED_LAST_WEEK_TICKETS;

  // El consolidado debe coincidir con las lineas visibles del panel.
  const ingresosBalanceAnterior = safeLastSponsors + safeLastTickets + lastMarketIncome;
  const gastosBalanceAnterior =
    safeLastSueldos +
    safeLastMantenimiento +
    (lastConsolidado > 0 ? lastConsolidado : 0) +
    lastGym +
    lastMarketExpense;
  const beneficioAnterior = ingresosBalanceAnterior - gastosBalanceAnterior;

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
            <p className="text-sm font-bold text-white capitalize">{getNextUpdateDate()} (hora Madrid)</p>
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
                <Row label="Mercado (Ventas)" value={currentMarketIncome} />
              </div>
            </div>
            <div className="p-8 space-y-4 bg-slate-950/20">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400 mb-6 flex justify-between border-b border-red-500/20 pb-2">
                <span>Gastos Est.</span>
              </h3>
              <div className="space-y-3">
                <Row label="Sueldos de Plantilla" value={estSueldos} isExpense />
                <Row label="Mantenimiento Pabellón" value={estMantenimiento} isExpense />
                <Row label="Gimnasio" value={currentGym} isExpense />
                <Row label="Mercado" value={currentMarketExpense} isExpense />
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
                <Row label="Patrocinadores y Socios" value={safeLastSponsors} />
                <Row label="Taquillas y Entradas" value={safeLastTickets} />
                <Row label="Mercado (Ventas)" value={lastMarketIncome} />
              </div>
            </div>
            <div className="p-8 space-y-4 bg-slate-950/20">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400/70 mb-6 flex justify-between border-b border-red-500/10 pb-2">
                <span>Gastos Reales</span>
              </h3>
              <div className="space-y-3">
                <Row label="Sueldos de Plantilla" value={safeLastSueldos} isExpense />
                <Row label="Mantenimiento Pabellón" value={safeLastMantenimiento} isExpense />
                {lastConsolidado > 0 && (
                  <Row label="Gastos Generales (Consolidado)" value={lastConsolidado} isExpense />
                )}
                <Row label="Gimnasio" value={lastGym} isExpense />
                <Row label="Mercado" value={lastMarketExpense} isExpense />
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
