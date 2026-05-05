import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityType =
  | 'match_win'
  | 'match_loss'
  | 'injury'
  | 'training'
  | 'market_outbid'
  | 'market_won'
  | 'market_sold';

export type ActivityEvent = {
  id: number;
  team_id: string;
  type: ActivityType;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
};

export const insertActivity = async (
  supabase: SupabaseClient,
  events: Array<{
    team_id: string;
    type: ActivityType;
    title: string;
    body?: string | null;
    href?: string | null;
  }>
): Promise<void> => {
  if (events.length === 0) return;
  await supabase.from('activity_feed').insert(
    events.map((e) => ({
      team_id: e.team_id,
      type: e.type,
      title: e.title,
      body: e.body ?? null,
      href: e.href ?? null
    }))
  );
};

export const fetchActivityFeed = async (
  supabase: SupabaseClient,
  teamId: string,
  limit = 20
): Promise<ActivityEvent[]> => {
  const { data } = await supabase
    .from('activity_feed')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ActivityEvent[];
};

export const ACTIVITY_META: Record<
  ActivityType,
  { color: string; border: string; icon: string }
> = {
  match_win:      { color: 'text-green-400',  border: 'border-l-green-500',  icon: '🏆' },
  match_loss:     { color: 'text-red-400',    border: 'border-l-red-500',    icon: '📉' },
  injury:         { color: 'text-red-400',    border: 'border-l-red-500',    icon: '🚑' },
  training:       { color: 'text-purple-400', border: 'border-l-purple-500', icon: '💪' },
  market_outbid:  { color: 'text-orange-400', border: 'border-l-orange-500', icon: '🔔' },
  market_won:     { color: 'text-emerald-400',border: 'border-l-emerald-500',icon: '✅' },
  market_sold:    { color: 'text-cyan-400',   border: 'border-l-cyan-500',   icon: '💰' },
};

export const formatRelativeTime = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days}d`;
  return new Date(isoDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};
