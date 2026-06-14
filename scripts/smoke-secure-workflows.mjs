import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3002';

if (!url || !anonKey || !serviceKey) {
  throw new Error('Missing Supabase environment variables');
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const client = createClient(url, anonKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `codex-smoke-${suffix}@example.com`;
const password = `Smoke-${suffix}-Aa1!`;

let userId = null;
let clubId = null;

const api = async (path, method, token, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${payload?.error || 'unknown error'}`);
  }
  return payload;
};

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createError || !created.user) throw createError || new Error('User creation failed');
  userId = created.user.id;

  const { data: club, error: clubError } = await admin
    .from('clubes')
    .insert({
      owner_id: userId,
      nombre: 'Smoke Club Seed',
      is_bot: false,
      status: 'ROOKIE_DRAFT',
      presupuesto: 1000000,
      league_id: 1
    })
    .select('id')
    .single();
  if (clubError || !club) throw clubError || new Error('Club creation failed');
  clubId = club.id;

  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError || new Error('Sign-in failed');
  const token = session.session.access_token;

  const { error: anonReadError } = await createClient(url, anonKey, { auth: { persistSession: false } })
    .from('players')
    .select('id')
    .limit(1);
  if (!anonReadError) throw new Error('Anonymous players read was not blocked');

  await api('/api/onboarding', 'POST', token, {
    managerName: 'Smoke Manager',
    clubName: 'Smoke Club',
    badgeShape: 'classic',
    primaryColor: '#123456'
  });

  const prepared = await api('/api/draft/prepare', 'POST', token);
  if (prepared.roster?.length !== 8 || prepared.candidates?.length !== 10) {
    throw new Error('Draft preparation returned unexpected roster or pool size');
  }

  await api(
    '/api/draft/confirm',
    'POST',
    token,
    { selectedIds: prepared.candidates.slice(0, 2).map((player) => player.id) }
  );

  await api('/api/manager/profile', 'PATCH', token, {
    managerName: 'Smoke Manager Updated',
    teamName: 'Smoke Club Updated',
    primaryColor: '#654321',
    secondaryColor: '#112233',
    jerseyHome: 'solid',
    jerseyAway: 'striped',
    badgeShape: 'modern'
  });

  const rotations = Object.fromEntries(
    ['q1', 'q2', 'q3', 'q4'].map((quarter) => [
      quarter,
      { PG: null, SG: null, SF: null, PF: null, C: null }
    ])
  );
  await api('/api/tactics', 'POST', token, {
    matchId: null,
    offense: 'BALANCED',
    defense: 'MAN_TO_MAN',
    rotations
  });

  await client.from('clubes').update({ nombre: 'Blocked Client Write' }).eq('id', clubId);
  const { data: unchangedClub, error: verifyClubError } = await admin
    .from('clubes')
    .select('nombre,status')
    .eq('id', clubId)
    .single();
  if (verifyClubError || unchangedClub?.nombre !== 'Smoke Club Updated' || unchangedClub?.status !== 'COMPETING') {
    throw verifyClubError || new Error('RLS did not block a direct club update');
  }

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
  ]);
  const badgePath = `${clubId}/smoke.png`;
  const { error: badgeError } = await client.storage
    .from('escudos')
    .upload(badgePath, png, { contentType: 'image/png', upsert: true });
  if (badgeError) throw badgeError;

  const { error: foreignBadgeError } = await client.storage
    .from('escudos')
    .upload(`00000000-0000-0000-0000-000000000000/smoke.png`, png, {
      contentType: 'image/png',
      upsert: true
    });
  if (!foreignBadgeError) throw new Error('Storage accepted a write outside the owned club folder');

  const { data: publicBadge } = client.storage.from('escudos').getPublicUrl(badgePath);
  await api('/api/manager/profile', 'PATCH', token, { badgeUrl: publicBadge.publicUrl });

  const deleteAuthAttempt = await client.rpc('delete_auth_user', { target_uid: userId });
  if (!deleteAuthAttempt.error) throw new Error('Legacy auth deletion RPC remained callable');

  const forbiddenAdminResponse = await fetch(`${baseUrl}/api/admin/users/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ownerId: userId })
  });
  if (forbiddenAdminResponse.status !== 403) {
    throw new Error(`Admin deletion route returned ${forbiddenAdminResponse.status} for a normal user`);
  }

  const { count: rosterCount, error: rosterError } = await admin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', clubId);
  if (rosterError || rosterCount !== 10) {
    throw rosterError || new Error(`Expected 10 roster players, found ${rosterCount}`);
  }

  console.log(JSON.stringify({
    ok: true,
    onboarding: true,
    draft: true,
    profile: true,
    tactics: true,
    rls: true,
    storage: true,
    protectedAdminRoute: true
  }));
} finally {
  if (clubId) {
    const { data: files } = await admin.storage.from('escudos').list(clubId);
    if (files?.length) {
      await admin.storage.from('escudos').remove(files.map((file) => `${clubId}/${file.name}`));
    }
    await admin.from('players').delete().eq('team_id', clubId);
    await admin.from('players').delete().eq('lineup_pos', `ROOKIE_DRAFT_POOL_${clubId}`);
    await admin.from('players').delete().eq('lineup_pos', `SEASON_DRAFT_POOL_${clubId}`);
  }
  if (userId) await admin.from('managers').delete().eq('owner_id', userId);
  if (clubId) await admin.from('clubes').delete().eq('id', clubId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
