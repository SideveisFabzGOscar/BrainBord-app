import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from './supabase/server';
import type { Role } from './meta';

export interface SessionContext {
  userId: string;
  email: string | null;
  fullName: string;
  role: Role;
  schoolId: string | null;
  schoolName: string | null;
  /** Eleven som vises: egen elev-ID (elev) eller valgt barn (foresatt) */
  studentId: string | null;
  studentName: string | null;
  children: { id: string; full_name: string }[];
}

export const CHILD_COOKIE = 'skolehub_child';

/** Henter innlogget bruker + rolle. Caches per forespørsel. */
export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role, school_id, email, schools(name)').eq('id', user.id).single();
  if (!profile) redirect('/login?feil=profil');

  const role = profile.role as Role;
  let studentId: string | null = null;
  let studentName: string | null = null;
  let children: SessionContext['children'] = [];
  let schoolName = (profile as unknown as { schools: { name: string } | null }).schools?.name ?? null;

  if (role === 'student') {
    const { data } = await supabase.from('students').select('id, full_name').eq('profile_id', user.id).maybeSingle();
    studentId = data?.id ?? null;
    studentName = data?.full_name ?? null;
  } else if (role === 'parent') {
    const { data } = await supabase.from('students').select('id, full_name, schools(name)').order('full_name');
    children = (data ?? []).map((c) => ({ id: c.id, full_name: c.full_name }));
    const wanted = (await cookies()).get(CHILD_COOKIE)?.value;
    const chosen = children.find((c) => c.id === wanted) ?? children[0];
    studentId = chosen?.id ?? null;
    studentName = chosen?.full_name ?? null;
    schoolName = (data?.[0] as unknown as { schools?: { name: string } })?.schools?.name ?? schoolName;
  }

  return {
    userId: user.id, email: profile.email ?? user.email ?? null, fullName: profile.full_name, role,
    schoolId: profile.school_id, schoolName, studentId, studentName, children,
  };
});

export function requireRole(s: SessionContext, ...roles: Role[]) {
  if (!roles.includes(s.role)) redirect('/dashboard?feil=tilgang');
}
