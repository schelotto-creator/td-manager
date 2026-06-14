import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.RECOVERY_BASE_URL || 'http://localhost:3002';
const maxMatches = Math.max(1, Math.min(40, Number(process.env.RECOVERY_MAX_MATCHES || 40)));

if (!url || !anonKey || !serviceKey) {
  throw new Error('Missing Supabase environment variables');
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const client = createClient(url, anonKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `codex-recovery-${suffix}@example.com`;
const password = `Recovery-${suffix}-Aa1!`;

let userId = null;
let clubId = null;

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
      nombre: `Recovery Club ${suffix}`,
      is_bot: false,
      status: 'COMPETING',
      presupuesto: 0,
      league_id: 1
    })
    .select('id')
    .single();
  if (clubError || !club) throw clubError || new Error('Club creation failed');
  clubId = club.id;

  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password
  });
  if (signInError || !session.session) throw signInError || new Error('Sign-in failed');

  const response = await fetch(`${baseUrl}/api/automation/pulse`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ maxMatches })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(
      `Recovery pulse failed: ${response.status} ${payload?.error || 'unknown error'}`
    );
  }

  console.log(JSON.stringify(payload, null, 2));
} finally {
  if (userId) await admin.from('managers').delete().eq('owner_id', userId);
  if (clubId) await admin.from('clubes').delete().eq('id', clubId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
