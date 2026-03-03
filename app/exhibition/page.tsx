'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Play, Pause, FastForward, ChevronLeft, Target, Activity, Hand, Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DEFAULT_MATCH_SIMULATOR_SETTINGS,
  fetchMatchSimulatorSettings,
  type MatchSimulatorSettings
} from '@/lib/match-simulator-config';
import {
  applyFormModifier,
  calculateWeightedOverallForRole,
  calculateWeightedOverallForBestRole,
  fetchPositionOverallConfig,
  getBestRoleForPlayer,
  getDefaultPositionOverallConfig,
  normalizePositionRole,
  type PositionOverallConfig
} from '@/lib/position-overall-config';

// --- COMPONENTES DE ESCUDOS Y LOGOS ---
function EscudoSVG({ forma, color, className }: any) {
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
      <svg viewBox="0 0 24 24" fill={color || 'currentColor'} className={`${className || 'w-full h-full'} drop-shadow-lg`}>
         {renderPath()}
      </svg>
    );
}

const TeamLogo = ({ team, className = 'w-full h-full' }: { team: any, className?: string }) => {
    if (!team) return <div className={`bg-slate-800 rounded-full ${className}`}></div>;
    // Buscamos escudo_url según la estructura de la tabla 'clubes'
    if (team.escudo_url) {
        return <img src={team.escudo_url} alt={team.nombre} className={`object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.5)] ${className}`} />;
    }
    return <EscudoSVG forma={team.escudo_forma} color={team.color_primario} className={className} />;
};

// --- TIPOS ---
type Player = { id: number; name: string; position: string; overall: number; shooting_2pt: number; shooting_3pt: number; defense: number; passing: number; rebounding: number; dribbling: number; speed: number; experience: number; stamina: number; currentStamina?: number; forma?: number; };
type LivePlayerStat = { name: string; team: 'home' | 'away'; pts: number; reb: number; ast: number; val: number; };
type CourtRole = 'Base' | 'Escolta' | 'Alero' | 'Ala-Pívot' | 'Pívot';
type LineupPlayer = { id: number, name: string, position: CourtRole, overall: number, energy: number };
const formatClockFromSeconds = (totalSeconds: number) => {
    const safe = Math.max(0, Math.round(totalSeconds));
    const min = Math.floor(safe / 60).toString().padStart(2, '0');
    const sec = (safe % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
};

const buildAssignedQuartersMap = (tactics: any) => {
    const result: Record<number, string[]> = {};
    const quarterOrder: Array<{ key: 'q1' | 'q2' | 'q3' | 'q4'; label: string }> = [
        { key: 'q1', label: 'Q1' },
        { key: 'q2', label: 'Q2' },
        { key: 'q3', label: 'Q3' },
        { key: 'q4', label: 'Q4' }
    ];

    quarterOrder.forEach(({ key, label }) => {
        const quarter = tactics?.[key];
        if (!quarter || typeof quarter !== 'object') return;
        Object.values(quarter).forEach((rawId) => {
            const playerId = Number(rawId);
            if (!Number.isFinite(playerId) || playerId <= 0) return;
            if (!result[playerId]) result[playerId] = [];
            result[playerId].push(label);
        });
    });

    return result;
};

export default function ExhibitionMatch() {
  const router = useRouter(); 

  const [myTeam, setMyTeam] = useState<any>(null);
  const [myRoster, setMyRoster] = useState<Player[]>([]);
  const [myTactics, setMyTactics] = useState<any>(null); 

  const [botTeam, setBotTeam] = useState<any>(null);
  const [botRoster, setBotRoster] = useState<Player[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [matchEvents, setMatchEvents] = useState<any[]>([]);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  
  const [displayedHomeScore, setDisplayedHomeScore] = useState(0);
  const [displayedAwayScore, setDisplayedAwayScore] = useState(0);
  const [displayedQuarter, setDisplayedQuarter] = useState('Q1');
  const [displayedTime, setDisplayedTime] = useState(formatClockFromSeconds(DEFAULT_MATCH_SIMULATOR_SETTINGS.quarterDurationSeconds));
  const [displayedPartials, setDisplayedPartials] = useState<{home: number, away: number}[]>([ {home: 0, away: 0}, {home: 0, away: 0}, {home: 0, away: 0}, {home: 0, away: 0} ]);
  const finalPartialsRef = useRef<{home: number, away: number}[]>([ {home: 0, away: 0}, {home: 0, away: 0}, {home: 0, away: 0}, {home: 0, away: 0} ]);

  const [displayedHomeLineup, setDisplayedHomeLineup] = useState<LineupPlayer[]>([]);
  const [displayedAwayLineup, setDisplayedAwayLineup] = useState<LineupPlayer[]>([]);

  const [liveStats, setLiveStats] = useState<Record<string, LivePlayerStat>>({});
  const [logs, setLogs] = useState<{time: string, quarter: string, text: string, type: string, isHomeAction: boolean | null, teamColor: string}[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  
  const [isLive, setIsLive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [speed, setSpeed] = useState(3);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [simulatorSettings, setSimulatorSettings] = useState<MatchSimulatorSettings>(DEFAULT_MATCH_SIMULATOR_SETTINGS);
  const [positionOverallConfig, setPositionOverallConfig] = useState<PositionOverallConfig>(getDefaultPositionOverallConfig());

  const filteredLogs = useMemo(() => {
      if (logFilter === 'ALL') return logs;
      return logs.filter(log => log.quarter === logFilter);
  }, [logs, logFilter]);
  const homeAssignedQuartersMap = useMemo(() => buildAssignedQuartersMap(myTactics), [myTactics]);

  const roleOrder: CourtRole[] = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
  const normalizePosition = (position: string): CourtRole => normalizePositionRole(position);

  const calculateRoleRating = (player: Player, role: CourtRole) => {
      const baseRating = calculateWeightedOverallForRole(player, role, positionOverallConfig);
      return applyFormModifier(baseRating, player.forma);
  };

  const pickUniqueLineup = (players: Player[]): Player[] => {
      const sorted = [...players].sort((a, b) => {
          const scoreA = calculateRoleRating(a, normalizePosition(a.position)) * ((a.currentStamina ?? 100) / 100);
          const scoreB = calculateRoleRating(b, normalizePosition(b.position)) * ((b.currentStamina ?? 100) / 100);
          return scoreB - scoreA;
      });
      const selectedByRole = new Map<CourtRole, Player>();
      const usedIds = new Set<number>();

      for (const p of sorted) {
          const role = normalizePosition(p.position);
          if (!selectedByRole.has(role)) {
              selectedByRole.set(role, p);
              usedIds.add(p.id);
          }
      }

      for (const role of roleOrder) {
          if (selectedByRole.has(role)) continue;
          const replacement = sorted.find(p => !usedIds.has(p.id) && normalizePosition(p.position) === role);
          if (replacement) {
              selectedByRole.set(role, replacement);
              usedIds.add(replacement.id);
          }
      }

      const unique = roleOrder.map(role => selectedByRole.get(role)).filter(Boolean) as Player[];
      if (unique.length >= 5) return unique.slice(0, 5);

      const extras = sorted.filter(p => !usedIds.has(p.id)).slice(0, 5 - unique.length);
      return [...unique, ...extras];
  };

  const toLineupState = (lineup: Player[]): LineupPlayer[] => {
      const usedIds = new Set<number>();
      const result: LineupPlayer[] = [];

      for (const role of roleOrder) {
          const natural = lineup.find(p => !usedIds.has(p.id) && normalizePosition(p.position) === role);
          if (natural) {
              usedIds.add(natural.id);
              result.push({
                  id: natural.id,
                  name: natural.name,
                  position: role,
                  overall: calculateRoleRating(natural, role),
                  energy: Math.round(natural.currentStamina ?? natural.stamina ?? 100)
              });
              continue;
          }
          const fallback = lineup.find(p => !usedIds.has(p.id));
          if (fallback) {
              usedIds.add(fallback.id);
              result.push({
                  id: fallback.id,
                  name: fallback.name,
                  position: role,
                  overall: calculateRoleRating(fallback, role),
                  energy: Math.round(fallback.currentStamina ?? fallback.stamina ?? 100)
              });
          }
      }

      return result;
  };

  const mapSlotToRole = (slot: string): CourtRole | null => {
      const s = (slot || '').toLowerCase();
      if (s === 'pg' || s.includes('base')) return 'Base';
      if (s === 'sg' || s.includes('escolta')) return 'Escolta';
      if (s === 'sf' || (s.includes('alero') && !s.includes('ala'))) return 'Alero';
      if (s === 'pf' || (s.includes('ala') && (s.includes('pivot') || s.includes('pívot')))) return 'Ala-Pívot';
      if (s === 'c' || s.includes('pivot') || s.includes('pívot')) return 'Pívot';
      return null;
  };

  const getQuarterLineupState = (roster: Player[], quarterIndex: number, tactics: any): LineupPlayer[] => {
      const quarterKey = `q${quarterIndex + 1}`;
      const fallbackPlayers = pickUniqueLineup(roster);
      const usedIds = new Set<number>();
      const rolePlayers = new Map<CourtRole, Player>();

      if (tactics && tactics[quarterKey]) {
          for (const [slot, playerId] of Object.entries(tactics[quarterKey] || {})) {
              const role = mapSlotToRole(slot);
              if (!role || !playerId) continue;
              const player = roster.find(p => p.id === playerId);
              if (player && !usedIds.has(player.id)) {
                  rolePlayers.set(role, player);
                  usedIds.add(player.id);
              }
          }
      }

      for (const role of roleOrder) {
          if (rolePlayers.has(role)) continue;
          const candidate = fallbackPlayers.find(p => !usedIds.has(p.id));
          if (candidate) {
              rolePlayers.set(role, candidate);
              usedIds.add(candidate.id);
          }
      }

      return roleOrder
          .map(role => {
              const player = rolePlayers.get(role);
              if (!player) return null;
              return {
                  id: player.id,
                  name: player.name,
                  position: role,
                  overall: calculateRoleRating(player, role),
                  energy: Math.round(player.currentStamina ?? player.stamina ?? 100)
              };
          })
          .filter(Boolean) as LineupPlayer[];
  };

  const getQuarterLineup = (roster: Player[], quarterIndex: number, tactics: any) => {
      const quarterKey = `q${quarterIndex + 1}`; 
      if (tactics && tactics[quarterKey]) {
          const lineupIds = Object.values(tactics[quarterKey]);
          const exactLineup = roster.filter(p => lineupIds.includes(p.id));
          const uniqueLineup = pickUniqueLineup(exactLineup);
          if (uniqueLineup.length === 5) return uniqueLineup;
      }
      return pickUniqueLineup(roster);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [loadedSimSettings, loadedPositionConfig] = await Promise.all([
          fetchMatchSimulatorSettings(supabase),
          fetchPositionOverallConfig(supabase)
        ]);
        setSimulatorSettings(loadedSimSettings);
        setPositionOverallConfig(loadedPositionConfig);
        setDisplayedTime(formatClockFromSeconds(loadedSimSettings.quarterDurationSeconds));

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: club } = await supabase.from('clubes').select('*').eq('owner_id', user.id).single();
        if (!club) { router.push('/onboarding'); return; }
        
        const { data: rosterData } = await supabase.from('players').select('*').eq('team_id', club.id);
        const roster = rosterData?.map((p) => ({
          ...p,
          position: getBestRoleForPlayer(p, loadedPositionConfig),
          overall: calculateWeightedOverallForBestRole(p, loadedPositionConfig),
          forma: p.forma || 80
        })) || [];
        
        setMyTeam(club);
        setMyRoster(roster);
        if (club.rotations) setMyTactics(club.rotations);

        setBotTeam({ 
            nombre: 'Bot Squad', escudo_forma: 'hexagon', color_primario: '#ef4444', escudo_url: null
        });
        
        const posArray = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot', 'Base', 'Alero', 'Pívot'];
        const fakeRoster: Player[] = Array.from({ length: 8 }).map((_, i) => {
            const rawPlayer = {
              id: 9000 + i,
              name: `Bot Player ${i+1}`,
              position: posArray[i],
              overall: 60 + Math.floor(Math.random() * 15),
              shooting_2pt: 55 + Math.floor(Math.random() * 25),
              shooting_3pt: 55 + Math.floor(Math.random() * 25),
              defense: 55 + Math.floor(Math.random() * 25),
              passing: 55 + Math.floor(Math.random() * 25),
              rebounding: 55 + Math.floor(Math.random() * 25),
              dribbling: 55 + Math.floor(Math.random() * 25),
              speed: 55 + Math.floor(Math.random() * 25),
              stamina: 100,
              forma: 80,
              experience: Math.floor(Math.random() * 50)
            };
            return {
              ...rawPlayer,
              position: getBestRoleForPlayer(rawPlayer, loadedPositionConfig),
              overall: calculateWeightedOverallForBestRole(rawPlayer, loadedPositionConfig)
            };
        });
        setBotRoster(fakeRoster);

        if (roster && roster.length > 0) {
            setDisplayedHomeLineup(getQuarterLineupState(roster, 0, club.rotations));
            setDisplayedAwayLineup(toLineupState(getQuarterLineup(fakeRoster, 0, null)));
        }

      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    loadData();
  }, []);

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
  };

  const pickPlayerByRole = (players: Player[], action: 'shoot' | 'rebound' | 'assist' | 'turnover', excludePlayer?: string) => {
      let available = players;
      if (excludePlayer) available = players.filter(p => p.name !== excludePlayer);
      if (available.length === 0) return players[0];

      const getPosWeight = (pos: string, action: string) => {
          if (action === 'shoot') return pos.includes('Base') ? 20 : pos.includes('Escolta') || pos.includes('Alero') ? 25 : 15;
          if (action === 'rebound') return pos.includes('Pívot') ? 35 : pos.includes('Ala-Pívot') ? 25 : pos.includes('Alero') ? 15 : 10;
          if (action === 'assist') return pos.includes('Base') ? 40 : pos.includes('Escolta') ? 20 : 10;
          return 20; 
      };

      const weights = available.map(p => {
          const baseWeight = getPosWeight(p.position, action);
          let statModifier = 1;
          if (action === 'shoot') statModifier = 1 + ((p.shooting_2pt + p.shooting_3pt) / 200);
          if (action === 'rebound') statModifier = 1 + (p.rebounding / 100);
          if (action === 'assist') statModifier = 1 + (p.passing / 100);
          return baseWeight * statModifier;
      });

      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      for (let i = 0; i < available.length; i++) { r -= weights[i]; if (r <= 0) return available[i]; }
      return available[0];
  };

  const generateMatchSimulation = () => {
      if (myRoster.length === 0 || botRoster.length === 0) return;
      const cfg = simulatorSettings;

      setLogs([]);
      setLiveStats({});
      setCurrentEventIndex(0);
      setDisplayedHomeScore(0);
      setDisplayedAwayScore(0);
      setDisplayedQuarter('Q1');
      setDisplayedTime(formatClockFromSeconds(cfg.quarterDurationSeconds));
      setDisplayedPartials([{home: 0, away: 0}, {home: 0, away: 0}, {home: 0, away: 0}, {home: 0, away: 0}]);

      const myTeamColor = myTeam?.color_primario || '#3b82f6';
      const botTeamColor = botTeam?.color_primario || '#ef4444';

      let simMyRoster = myRoster.map(p => ({...p, currentStamina: p.stamina || 100}));
      let simBotRoster = botRoster.map(p => ({...p, currentStamina: p.stamina || 100}));

      let events = [];
      let homeScore = 0;
      let awayScore = 0;
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      let storedPartials = [{home:0, away:0}, {home:0, away:0}, {home:0, away:0}, {home:0, away:0}];

      const initialStats: Record<string, LivePlayerStat> = {};
      [...simMyRoster, ...simBotRoster].forEach(p => {
          initialStats[p.name] = { name: p.name, team: simMyRoster.includes(p) ? 'home' : 'away', pts: 0, reb: 0, ast: 0, val: 0 };
      });
      setLiveStats(initialStats);

      const drainLineupStamina = (lineup: Player[], possessionSecs: number, isAttackingTeam: boolean) => {
          lineup.forEach(p => {
              const role = normalizePosition(p.position);
              const roleLoad = role === 'Base' ? 1.1 : role === 'Pívot' ? 0.95 : 1;
              const baseDrain = isAttackingTeam ? cfg.drainAttackBase : cfg.drainDefenseBase;
              const drain = (baseDrain + possessionSecs * cfg.drainPerPossessionSecond) * roleLoad;
              const current = p.currentStamina ?? p.stamina ?? 100;
              p.currentStamina = Math.max(0, current - drain);
          });
      };

      const recoverBenchStamina = (roster: Player[], onCourtIds: Set<number>) => {
          roster.forEach(p => {
              if (onCourtIds.has(p.id)) return;
              const current = p.currentStamina ?? p.stamina ?? 100;
              p.currentStamina = Math.min(100, current + cfg.benchPossessionRecovery);
          });
      };

      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

      const formatLineupSummary = (lineup: LineupPlayer[]) => {
          return lineup.map(p => `${p.position}: ${p.name}`).join(', ');
      };

      let prevHomeOnCourt = new Set<number>();
      let prevAwayOnCourt = new Set<number>();

      for (let q = 0; q < 4; q++) {
          let timeRemaining = cfg.quarterDurationSeconds; 
          let isHomeAttacking = q % 2 === 0; 
          let homeQScore = 0;
          let awayQScore = 0;

          if (q > 0) {
              simMyRoster.forEach(p => {
                  const recovery = prevHomeOnCourt.has(p.id) ? cfg.onCourtQuarterRecovery : cfg.benchQuarterRecovery;
                  p.currentStamina = Math.min(100, (p.currentStamina || 0) + recovery);
              });
              simBotRoster.forEach(p => {
                  const recovery = prevAwayOnCourt.has(p.id) ? cfg.onCourtQuarterRecovery : cfg.benchQuarterRecovery;
                  p.currentStamina = Math.min(100, (p.currentStamina || 0) + recovery);
              });
          }
          
          let myStarters = getQuarterLineup(simMyRoster, q, myTactics);
          let botStarters = getQuarterLineup(simBotRoster, q, null); 
          prevHomeOnCourt = new Set(myStarters.map(p => p.id));
          prevAwayOnCourt = new Set(botStarters.map(p => p.id));

          const getCurrentStates = () => ({
              home: getQuarterLineupState(simMyRoster, q, myTactics),
              away: toLineupState(botStarters)
          });
          const currentStates = getCurrentStates();

          events.push({
              quarter: quarters[q], time: formatClockFromSeconds(cfg.quarterDurationSeconds), home_score: homeScore, away_score: awayScore, home_q: homeQScore, away_q: awayQScore, type: 'info', isHomeAction: true, teamColor: myTeamColor,
              text: `Inicio ${quarters[q]}\n${myTeam?.nombre || 'Local'}: ${formatLineupSummary(currentStates.home)}\n${botTeam?.nombre || 'Rival'}: ${formatLineupSummary(currentStates.away)}`,
              homeLineup: currentStates.home,
              awayLineup: currentStates.away
          });

          while (timeRemaining > 0) {
              const minPossession = Math.max(1, Math.round(cfg.possessionMinSeconds));
              const maxPossession = Math.max(minPossession, Math.round(cfg.possessionMaxSeconds));
              const possessionSecs = Math.floor(Math.random() * (maxPossession - minPossession + 1)) + minPossession; 
              timeRemaining = Math.max(0, timeRemaining - possessionSecs);
              const timeString = formatTime(timeRemaining);

              const attackers = isHomeAttacking ? myStarters : botStarters;
              const defenders = isHomeAttacking ? botStarters : myStarters;
              const attackColor = isHomeAttacking ? myTeamColor : botTeamColor;
              const homeOnCourtIds = new Set(myStarters.map(p => p.id));
              const awayOnCourtIds = new Set(botStarters.map(p => p.id));

              drainLineupStamina(attackers, possessionSecs, true);
              drainLineupStamina(defenders, possessionSecs, false);
              recoverBenchStamina(simMyRoster, homeOnCourtIds);
              recoverBenchStamina(simBotRoster, awayOnCourtIds);

              const updatedStates = getCurrentStates();
              const attacker = pickPlayerByRole(attackers, 'shoot');
              const defender = pickPlayerByRole(defenders, 'turnover'); 

              const eventObj: any = {
                  quarter: quarters[q], time: timeString, home_score: homeScore, away_score: awayScore, home_q: homeQScore, away_q: awayQScore,
                  isHomeAction: isHomeAttacking, attacker: attacker.name, teamColor: attackColor, homeLineup: updatedStates.home, awayLineup: updatedStates.away
              };

              const isThreePointer = Math.random() < cfg.threePointAttemptRate; 
              const baseChance = isThreePointer ? cfg.baseThreePointChance : cfg.baseTwoPointChance;
              const attackerEnergy = attacker.currentStamina ?? 100;
              const defenderEnergy = defender.currentStamina ?? 100;
              const attackerRole = normalizePosition(attacker.position);
              const defenderRole = normalizePosition(defender.position);
              const attackerRating = calculateRoleRating(attacker, attackerRole);
              const defenderRating = calculateRoleRating(defender, defenderRole);
              const energyShotImpact = (attackerEnergy - 70) * cfg.shotAttackerEnergyImpact;
              const defenseShotImpact = (defenderEnergy - 70) * cfg.shotDefenderEnergyImpact;
              const skillImpact = (attackerRating - defenderRating) * cfg.shotSkillImpact;
              const shotChance = clamp(baseChance + energyShotImpact - defenseShotImpact + skillImpact, cfg.shotChanceMin, cfg.shotChanceMax);
              const turnoverChance = clamp(
                  cfg.turnoverBaseChance +
                  Math.max(0, 60 - attackerEnergy) * cfg.turnoverLowEnergyImpact +
                  Math.max(0, defenderEnergy - 65) * cfg.turnoverDefenseEnergyImpact,
                  cfg.turnoverChanceMin,
                  cfg.turnoverChanceMax
              );

              if ((Math.random() * 100) < turnoverChance) {
                  eventObj.type = 'turnover';
                  eventObj.text = `${attacker.name} pierde el balón ante ${defender.name}.`;
              } else if ((Math.random() * 100) < shotChance) { 
                  const pts = isThreePointer ? 3 : 2;
                  if (isHomeAttacking) { homeScore += pts; homeQScore += pts; } else { awayScore += pts; awayQScore += pts; }
                  eventObj.type = 'basket';
                  eventObj.points = pts;
                  if (Math.random() < cfg.assistRate) {
                      const assister = pickPlayerByRole(attackers, 'assist', attacker.name);
                      eventObj.assister = assister.name;
                      eventObj.text = `${attacker.name} anota de ${pts} puntos (asistencia de ${assister.name}).`;
                  } else {
                      eventObj.text = `${attacker.name} anota de ${pts} puntos.`;
                  }
              } else {
                  eventObj.type = 'fail';
                  const reboundTeamIsHome = Math.random() < cfg.offensiveReboundRate ? isHomeAttacking : !isHomeAttacking;
                  const reboundPool = reboundTeamIsHome ? myStarters : botStarters;
                  const rebounder = pickPlayerByRole(reboundPool, 'rebound');
                  eventObj.rebounder = rebounder.name;
                  eventObj.text = `${attacker.name} falla el tiro. Rebote de ${rebounder.name}.`;
              }
              eventObj.home_score = homeScore; eventObj.away_score = awayScore;
              eventObj.home_q = homeQScore; eventObj.away_q = awayQScore;
              events.push(eventObj);
              isHomeAttacking = !isHomeAttacking;
          }
          storedPartials[q] = { home: homeQScore, away: awayQScore };
      }
      finalPartialsRef.current = storedPartials;
      setMatchEvents(events);
      setCurrentEventIndex(0);
      setIsLive(true);
      setIsFinished(false);
  };

  const processEventStats = (ev: any, currentStats: Record<string, LivePlayerStat>) => {
      if (!ev.attacker && !ev.rebounder && !ev.assister) return currentStats;
      const next = { ...currentStats };
      if (ev.attacker) {
          next[ev.attacker] = { ...(next[ev.attacker] || { name: ev.attacker, team: ev.isHomeAction ? 'home' : 'away', pts: 0, reb: 0, ast: 0, val: 0 }) };
          if (ev.points) { next[ev.attacker].pts += ev.points; next[ev.attacker].val += ev.points; }
          if (ev.type === 'turnover' || ev.type === 'fail' || ev.type === 'defense_xp') next[ev.attacker].val -= 1; 
      }
      if (ev.rebounder) {
          next[ev.rebounder] = { ...(next[ev.rebounder] || { name: ev.rebounder, team: ev.isHomeAction ? 'home' : 'away', pts: 0, reb: 0, ast: 0, val: 0 }) };
          next[ev.rebounder].reb += 1;
          next[ev.rebounder].val += 1;
      }
      if (ev.assister) {
          next[ev.assister] = { ...(next[ev.assister] || { name: ev.assister, team: ev.isHomeAction ? 'home' : 'away', pts: 0, reb: 0, ast: 0, val: 0 }) };
          next[ev.assister].ast += 1;
          next[ev.assister].val += 1;
      }
      return next;
  };

  useEffect(() => {
    if (isLive && matchEvents.length > 0) {
      playTimerRef.current = setInterval(() => {
        if (currentEventIndex < matchEvents.length) {
            const ev = matchEvents[currentEventIndex];
            setDisplayedHomeScore(ev.home_score);
            setDisplayedAwayScore(ev.away_score);
            setDisplayedQuarter(ev.quarter);
            setDisplayedTime(ev.time);
            if (ev.homeLineup) setDisplayedHomeLineup(ev.homeLineup);
            if (ev.awayLineup) setDisplayedAwayLineup(ev.awayLineup);
            const qIndex = parseInt(ev.quarter.charAt(1)) - 1;
            if (!isNaN(qIndex)) { setDisplayedPartials(prev => { const next = [...prev]; next[qIndex] = { home: ev.home_q, away: ev.away_q }; return next; }); }
            setLogs(prev => [{time: ev.time, quarter: ev.quarter, text: ev.text, type: ev.type, isHomeAction: ev.isHomeAction, teamColor: ev.teamColor}, ...prev]);
            setLiveStats(prev => processEventStats(ev, prev));
            setCurrentEventIndex(prev => prev + 1);
        } else {
            setIsLive(false); setIsFinished(true); clearInterval(playTimerRef.current!);
        }
      }, 1500 / speed); 
    }
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [isLive, speed, currentEventIndex, matchEvents]);

  const fastForwardToEnd = () => {
      if (matchEvents.length === 0) return;
      setIsLive(false);
      const lastEvent = matchEvents[matchEvents.length - 1];
      setDisplayedHomeScore(lastEvent.home_score); setDisplayedAwayScore(lastEvent.away_score);
      setDisplayedQuarter('Q4'); setDisplayedTime('00:00'); setDisplayedPartials(finalPartialsRef.current);
      if (lastEvent.homeLineup) setDisplayedHomeLineup(lastEvent.homeLineup);
      if (lastEvent.awayLineup) setDisplayedAwayLineup(lastEvent.awayLineup);
      setCurrentEventIndex(matchEvents.length); setIsFinished(true);
  };

  const getLeaders = (statKey: keyof LivePlayerStat) => {
      return Object.values(liveStats).sort((a, b) => (b[statKey] as number) - (a[statKey] as number)).slice(0, 4);
  };

  // --- MAPA DE POSICIONES REDISEÑADO (10 JUGADORES VISIBLES) ---
  const getPlayerPositionOnCourt = (pos: CourtRole, team: 'home'|'away') => {
      const homeMap: Record<CourtRole, {x: number, y: number}> = {
          Base: { x: 18, y: 50 },
          Escolta: { x: 30, y: 24 },
          Alero: { x: 30, y: 76 },
          'Ala-Pívot': { x: 42, y: 36 },
          'Pívot': { x: 42, y: 64 },
      };

      const awayMap: Record<CourtRole, {x: number, y: number}> = {
          Base: { x: 82, y: 50 },
          Escolta: { x: 70, y: 24 },
          Alero: { x: 70, y: 76 },
          'Ala-Pívot': { x: 58, y: 36 },
          'Pívot': { x: 58, y: 64 },
      };

      const p = team === 'home' ? homeMap[pos] : awayMap[pos];
      return { left: `${p.x}%`, top: `${p.y}%` };
  };

  const getOvrColor = (ovr: number) => {
      if (ovr >= 85) return 'bg-yellow-500 text-slate-900 border-yellow-300';
      if (ovr >= 75) return 'bg-green-500 text-slate-900 border-green-300';
      if (ovr >= 65) return 'bg-blue-500 text-white border-blue-400';
      return 'bg-slate-600 text-white border-slate-500';
  };

  const renderPlayerOnCourt = (p: LineupPlayer, team: 'home'|'away', color: string, assignedQuarters: string[] = []) => {
      const posStyle = getPlayerPositionOnCourt(p.position, team);
      const rawEnergy = Number.isFinite(p.energy) ? p.energy : 100;
      const energy = Math.max(0, Math.min(100, Math.round(rawEnergy)));
      const energyColor = energy >= 70 ? 'bg-emerald-500' : energy >= 40 ? 'bg-amber-400' : 'bg-red-500';
      return (
          <div key={`${p.id}-${team}`} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-30 transition-all duration-500" style={posStyle}>
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-xs md:text-sm border-2 shadow-[0_0_18px_rgba(0,0,0,0.45)] ${getOvrColor(p.overall)}`} style={{borderColor: color}}>
                  {p.overall}
              </div>
              <div className="mt-1 min-w-[94px] md:min-w-[112px] bg-slate-950/95 px-2 py-1 rounded-lg border border-slate-700/80 shadow-lg text-white">
                  <div className="flex items-center justify-between gap-2">
                      <span className="text-[8px] md:text-[9px] uppercase tracking-wide text-cyan-300 font-black leading-none">{p.position}</span>
                      <span className="text-[8px] md:text-[9px] font-black text-slate-200">E {energy}%</span>
                  </div>
                  <div className="text-[9px] md:text-[10px] font-bold truncate mt-0.5">{p.name.split(' ').pop()}</div>
                  <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wide truncate">
                      Q: {assignedQuarters.length > 0 ? assignedQuarters.join(' · ') : '-'}
                  </div>
                  <div className="mt-1 h-1.5 md:h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                      <div className={`h-full transition-[width] duration-500 ${energyColor}`} style={{ width: `${energy}%` }}></div>
                  </div>
                  <div className="hidden md:flex mt-0.5 justify-between text-[8px] text-slate-400">
                      <span>Baja</span>
                      <span>Alta</span>
                  </div>
              </div>
              {energy <= 35 && (
                  <div className="absolute top-[52px] md:top-[60px] right-[-4px] md:right-[-6px] bg-red-500 text-white text-[7px] md:text-[8px] font-black px-1.5 py-0.5 rounded">
                      FATIGA
                  </div>
              )}
          </div>
      );
  };

  const renderLogEntry = (log: any, index: number) => {
    const teamForLogo = log.isHomeAction === true ? myTeam : log.isHomeAction === false ? botTeam : null;
    return (
        <div key={index} className="flex items-center justify-between bg-slate-900/40 p-4 border border-white/5 relative overflow-hidden group animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-4 relative z-10 w-full">
                <span className="font-mono text-xs text-slate-500 w-10 shrink-0">{log.time}</span>
                {teamForLogo && <div className="w-8 h-8 shrink-0"><TeamLogo team={teamForLogo} /></div>}
                <span className="text-sm md:text-base text-white leading-tight font-medium whitespace-pre-line">{log.text}</span>
            </div>
            {log.teamColor && <div className="absolute right-0 top-0 bottom-0 w-1.5 opacity-50" style={{backgroundColor: log.teamColor}}></div>}
        </div>
    );
  };

  const LeaderBoard = ({ title, icon, data, statKey }: any) => (
      <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-4 shadow-xl">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">{icon} {title}</h3>
          <div className="flex flex-col gap-2">
              {data.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between items-center bg-slate-950/50 p-2.5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-[10px] font-black text-slate-600 w-3">{i+1}</span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${p.team === 'home' ? 'bg-cyan-500' : 'bg-red-500'}`}></span>
                          <span className="text-xs font-bold text-slate-200 truncate">{p.name}</span>
                      </div>
                      <span className="text-sm font-black text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700">{Math.round(p[statKey])}</span>
                  </div>
              ))}
          </div>
      </div>
  );

  if (loading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-cyan-500 animate-pulse font-mono tracking-widest uppercase">Calentando motores...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative overflow-hidden flex flex-col">
      <div className="w-full max-w-7xl mx-auto flex justify-between items-center mb-6 relative z-10">
         <Link href="/" className="text-slate-500 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-slate-900 px-4 py-2 rounded-lg border border-slate-800">
            <ChevronLeft size={14}/> Volver
         </Link>
         <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
             {[1, 3, 5, 10].map(s => ( <button key={s} onClick={() => setSpeed(s)} className={`px-4 py-1.5 rounded-md text-[10px] font-black transition-all ${speed === s ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}>x{s}</button> ))}
         </div>
      </div>

      <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 relative z-10">
          {/* PISTA Y MARCADOR */}
          <div className="w-full bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative">
              <div className="w-full p-3 md:p-5 flex items-center justify-center bg-slate-950 border-b border-slate-800">
                  <div className="flex items-center gap-4 bg-slate-950/95 p-3 md:p-5 rounded-2xl border border-slate-800 shadow-2xl">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 hidden sm:block"><TeamLogo team={myTeam}/></div>
                          <div className="text-4xl md:text-6xl font-black">{displayedHomeScore}</div>
                      </div>
                      <div className="flex flex-col items-center px-4 border-x border-slate-800">
                          <span className="text-cyan-400 font-black text-[10px] uppercase">{displayedQuarter}</span>
                          <span className="font-mono text-xl md:text-3xl font-black text-white">{displayedTime}</span>
                      </div>
                      <div className="flex items-center gap-4">
                          <div className="text-4xl md:text-6xl font-black">{displayedAwayScore}</div>
                          <div className="w-12 h-12 hidden sm:block"><TeamLogo team={botTeam}/></div>
                      </div>
                  </div>
              </div>

              <div className="w-full h-[320px] md:h-[420px] relative flex items-center justify-center bg-[#0f172a]">
                  <div className="absolute inset-4 border-2 border-amber-100/25 rounded-xl"></div>
                  <div className="absolute w-px h-[calc(100%-2rem)] bg-amber-100/30 left-1/2 -translate-x-1/2"></div>
                  <div className="absolute left-1/2 -translate-x-1/2 w-[15%] h-[30%] border border-amber-100/25 rounded-full"></div>
                  <div className="absolute left-4 w-[14%] h-[42%] border border-amber-100/25 rounded-r-xl"></div>
                  <div className="absolute right-4 w-[14%] h-[42%] border border-amber-100/25 rounded-l-xl"></div>

                  {displayedHomeLineup.map(p => renderPlayerOnCourt(p, 'home', myTeam?.color_primario || '#06b6d4', homeAssignedQuartersMap[p.id] || []))}
                  {displayedAwayLineup.map(p => renderPlayerOnCourt(p, 'away', botTeam?.color_primario || '#ef4444', []))}
              </div>

              {/* PARCIALES */}
              <div className="w-full bg-slate-950 border-t border-slate-800 p-4 flex justify-center z-40">
                  <table className="text-[10px] font-mono text-center w-full max-w-2xl">
                      <thead>
                          <tr className="text-slate-500 border-b border-slate-800/50">
                              <th className="text-left pb-2">EQUIPO</th>
                              <th className="pb-2">Q1</th><th className="pb-2">Q2</th><th className="pb-2">Q3</th><th className="pb-2">Q4</th><th className="pb-2 text-cyan-400">TOT</th>
                          </tr>
                      </thead>
                      <tbody className="text-white font-bold">
                          <tr className="border-b border-slate-800/30">
                              <td className="text-left py-2 flex items-center gap-2 truncate max-w-[100px]">{myTeam?.nombre}</td>
                              <td>{displayedPartials[0].home}</td><td>{displayedPartials[1].home}</td><td>{displayedPartials[2].home}</td><td>{displayedPartials[3].home}</td>
                              <td className="text-cyan-400">{displayedHomeScore}</td>
                          </tr>
                          <tr>
                              <td className="text-left py-2 flex items-center gap-2 truncate max-w-[100px]">{botTeam?.nombre}</td>
                              <td>{displayedPartials[0].away}</td><td>{displayedPartials[1].away}</td><td>{displayedPartials[2].away}</td><td>{displayedPartials[3].away}</td>
                              <td className="text-cyan-400">{displayedAwayScore}</td>
                          </tr>
                      </tbody>
                  </table>
              </div>
          </div>

          {/* LOGS Y LÍDERES */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full h-[600px]">
              <div className="xl:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden">
                  <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase text-slate-400">Resumen de Acciones</span>
                          {isFinished && <span className="text-[10px] font-black uppercase text-emerald-400">Final</span>}
                      </div>
                      <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                              <Filter size={12} className="text-slate-500"/>
                              <select
                                  value={logFilter}
                                  onChange={(e) => setLogFilter(e.target.value as 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4')}
                                  className="bg-transparent text-xs font-semibold text-slate-300 outline-none"
                              >
                                  <option value="ALL">Todo</option>
                                  <option value="Q1">Q1</option>
                                  <option value="Q2">Q2</option>
                                  <option value="Q3">Q3</option>
                                  <option value="Q4">Q4</option>
                              </select>
                          </div>
                          {!isLive && currentEventIndex === 0 ? (
                              <button onClick={generateMatchSimulation} className="px-4 py-2 bg-cyan-600 text-slate-950 rounded-xl font-black text-xs uppercase flex items-center gap-1">
                                  <Play size={14}/> Iniciar
                              </button>
                          ) : (
                              <>
                                  <button
                                      onClick={() => setIsLive(!isLive)}
                                      disabled={isFinished}
                                      className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  >
                                      {isLive ? <Pause size={14}/> : <Play size={14}/>}
                                      {isLive ? 'Pausar' : 'Reanudar'}
                                  </button>
                                  <button onClick={fastForwardToEnd} className="px-3 py-2 bg-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1">
                                      <FastForward size={14}/> Fin
                                  </button>
                              </>
                          )}
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-3 bg-slate-900/30 custom-scrollbar">
                      {filteredLogs.map((log, i) => renderLogEntry(log, i))}
                  </div>
              </div>

              <div className="xl:col-span-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                  <LeaderBoard title="Anotación" icon={<Target size={16}/>} data={getLeaders('pts')} statKey="pts" />
                  <LeaderBoard title="Rebotes" icon={<Activity size={16}/>} data={getLeaders('reb')} statKey="reb" />
                  <LeaderBoard title="Asistencias" icon={<Hand size={16}/>} data={getLeaders('ast')} statKey="ast" />
              </div>
          </div>
      </div>
    </div>
  );
}
