import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateSeasonObjectives } from '@/lib/season-objectives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: manager } = await supabaseAdmin
    .from('managers')
    .select('is_admin')
    .eq('owner_id', authData.user.id)
    .maybeSingle();

  if (!(manager as any)?.is_admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Derive current season from the latest match
  const { data: latestMatch } = await supabaseAdmin
    .from('matches')
    .select('season_number')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const seasonNumber = Number((latestMatch as any)?.season_number ?? 1);

  await generateSeasonObjectives(supabaseAdmin, seasonNumber);

  // Count how many objectives were created/already exist
  const { count } = await supabaseAdmin
    .from('season_objectives')
    .select('id', { count: 'exact', head: true })
    .eq('season_number', seasonNumber);

  return NextResponse.json({ ok: true, seasonNumber, objectivesCount: count ?? 0 });
}
