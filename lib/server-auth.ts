import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export class ApiAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

export const getBearerToken = (request: NextRequest | Request) => {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

export const requireAuthenticatedUser = async (request: NextRequest | Request) => {
  const token = getBearerToken(request);
  if (!token) throw new ApiAuthError('No autenticado', 401);

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new ApiAuthError('Sesión inválida', 401);

  return { supabaseAdmin, user: data.user };
};

export const requireAdminUser = async (request: NextRequest | Request) => {
  const auth = await requireAuthenticatedUser(request);
  const { data: manager, error } = await auth.supabaseAdmin
    .from('managers')
    .select('is_admin')
    .eq('owner_id', auth.user.id)
    .maybeSingle();

  if (error || !(manager as { is_admin?: boolean } | null)?.is_admin) {
    throw new ApiAuthError('Acceso de administrador requerido', 403);
  }

  return auth;
};

export const requireOwnedClub = async (request: NextRequest | Request) => {
  const auth = await requireAuthenticatedUser(request);
  const { data: club, error } = await auth.supabaseAdmin
    .from('clubes')
    .select('id, presupuesto, league_id, owner_id')
    .eq('owner_id', auth.user.id)
    .maybeSingle();

  if (error || !club) throw new ApiAuthError('Equipo no encontrado', 404);

  return { ...auth, club };
};

export const toApiError = (error: unknown) => {
  if (error instanceof ApiAuthError) {
    return { message: error.message, status: error.status };
  }
  return {
    message: error instanceof Error ? error.message : 'Error desconocido',
    status: 500
  };
};
