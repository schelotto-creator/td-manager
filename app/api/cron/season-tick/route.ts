import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runScheduledMatches } from '@/lib/scheduled-match-runner';
import { getWeeklySalaryByOvr } from '@/lib/salary';
import { fetchEconomyRules, getLeagueEconomy } from '@/lib/economy-balance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const isMissingRpc = (error: unknown, functionName: string) => {
  const text = toErrorText(error).toLowerCase();
  return (
    text.includes(functionName.toLowerCase()) &&
    (text.includes('could not find the function') ||
      text.includes('no function matches') ||
      text.includes('does not exist') ||
      text.includes('not found'))
  );
};

const parseBooleanFlag = (value: string | null) => value === '1' || value === 'true' || value === 'yes';
const parsePositiveInt = (value: string | null) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const isAuthorized = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET || process.env.SCHEDULER_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const query = request.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
};

// --- NUEVA LÓGICA DE FINANZAS EN TYPESCRIPT ---
// Reemplaza la lógica SQL propensa a errores de copiar transacciones antiguas.
const runWeeklyFinanceUpdate = async (supabase: any) => {
  console.log('Ejecutando actualización financiera semanal (TypeScript)...');
  
  try {
    // 1. Obtener reglas económicas y datos necesarios
    const [economyRules, clubsRes, playersRes, leaguesRes] = await Promise.all([
      fetchEconomyRules(supabase),
      supabase.from('clubes').select('id, league_id, presupuesto'),
      supabase.from('players').select('team_id, overall'),
      supabase.from('ligas').select('id, nivel')
    ]);

    if (clubsRes.error) throw clubsRes.error;
    const clubs = clubsRes.data || [];
    const players = playersRes.data || [];
    const leagues = leaguesRes.data || [];

    // Mapas para acceso rápido
    const playersByTeam: Record<string, any[]> = {};
    players.forEach((p: any) => {
      if (p.team_id) {
        if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = [];
        playersByTeam[p.team_id].push(p);
      }
    });

    const leagueLevelMap = new Map();
    leagues.forEach((l: any) => leagueLevelMap.set(l.id, l.nivel));

    // 2. Procesar cada club
    for (const club of clubs) {
      const teamPlayers = playersByTeam[club.id] || [];
      
      // Calcular Salarios (Suma de salarios de jugadores actuales)
      const totalSalarios = teamPlayers.reduce((sum: number, p: any) => {
        return sum + getWeeklySalaryByOvr(p.overall);
      }, 0);

      // Calcular Mantenimiento de Estadio
      let maintenance = 0;
      if (club.league_id && leagueLevelMap.has(club.league_id)) {
        const level = leagueLevelMap.get(club.league_id);
        const economy = getLeagueEconomy(level, economyRules);
        maintenance = economy.venueMaintenance;
      }

      const totalExpenses = totalSalarios + maintenance;

      // 3. Actualizar Presupuesto y Registrar Transacción
      if (totalExpenses > 0) {
        // Actualizamos el presupuesto restando los gastos calculados
        const { error: updateError } = await supabase
          .from('clubes')
          .update({ presupuesto: (club.presupuesto || 0) - totalExpenses })
          .eq('id', club.id);

        if (!updateError) {
          // Insertamos una ÚNICA transacción consolidada para la semana
          await supabase.from('finance_transactions').insert({
            team_id: club.id,
            concepto: 'Cierre Semanal: Salarios y Mantenimiento',
            monto: -totalExpenses,
            tipo: 'GASTO',
            fecha: new Date().toISOString()
          });
        }
      }
    }
    console.log(`Finanzas actualizadas correctamente para ${clubs.length} clubes.`);
    return { status: 'ok', clubs_processed: clubs.length };
  } catch (err) {
    console.error('Error en runWeeklyFinanceUpdate:', err);
    return { status: 'error', error: toErrorText(err) };
  }
};

const runTick = async (request: NextRequest) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const forceWeekly = parseBooleanFlag(request.nextUrl.searchParams.get('forceWeekly'));
  const envMaxMatches =
    parsePositiveInt(process.env.CRON_MAX_MATCHES || null) ||
    parsePositiveInt(process.env.SCHEDULER_MAX_MATCHES || null) ||
    220;
  const requestedMaxMatches = parsePositiveInt(request.nextUrl.searchParams.get('maxMatches'));
  const maxMatches = Math.max(1, Math.min(300, requestedMaxMatches || envMaxMatches));
  const supabaseAdmin = getSupabaseAdmin();

  let weeklyMaintenance: any = { status: 'not_executed' };
  const warnings: string[] = [];

  try {
    const { data, error } = await supabaseAdmin.rpc('run_weekly_maintenance', { p_force: forceWeekly });
    if (error) {
      if (isMissingRpc(error, 'run_weekly_maintenance')) {
        weeklyMaintenance = { status: 'rpc_missing' };
        warnings.push(
          'run_weekly_maintenance no existe en BD. Aplica la migración 20260302_automation_scheduler.sql.'
        );
      } else {
        throw new Error(`Fallo mantenimiento semanal: ${toErrorText(error)}`);
      }
    } else {
      weeklyMaintenance = data || { status: 'ok' };
    }

    // Si se ejecutó el mantenimiento semanal (o se forzó), ejecutamos el cálculo financiero corregido en TS.
    // Asumimos que si 'data' es truthy o forceWeekly es true, toca cierre semanal.
    // Nota: Ajusta esta condición según lo que devuelva tu RPC exactamente.
    if (forceWeekly || (weeklyMaintenance && (weeklyMaintenance as any).status !== 'not_executed')) {
       const financeResult = await runWeeklyFinanceUpdate(supabaseAdmin);
       weeklyMaintenance = { ...weeklyMaintenance, finance: financeResult };
    }

    const scheduledMatches = await runScheduledMatches(supabaseAdmin, { now, maxMatches });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      weeklyMaintenance,
      scheduledMatches,
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        timestamp: now.toISOString(),
        weeklyMaintenance,
        warnings,
        error: toErrorText(error)
      },
      { status: 500 }
    );
  }
};

export async function GET(request: NextRequest) {
  return runTick(request);
}

export async function POST(request: NextRequest) {
  return runTick(request);
}
