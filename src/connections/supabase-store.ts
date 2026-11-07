import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectionPatch, ConnectionRow, ConnectionStore } from './service';
import type { ConnPlatform, PersonalItem } from './types';

/**
 * Lagring med service role. Brukes KUN fra API-ruter etter at innlogget bruker
 * er bekreftet, og alle spørringer er låst til den brukerens profile_id.
 */
export class SupabaseConnectionStore implements ConnectionStore {
  constructor(private db: SupabaseClient) {}

  async get(userId: string, platform: ConnPlatform): Promise<ConnectionRow | null> {
    const { data, error } = await this.db.from('user_connections')
      .select('status, token_ciphertext, token_iv, access_expires_at').eq('profile_id', userId).eq('platform', platform).maybeSingle();
    if (error) throw error;
    return data ? { status: data.status, tokenCiphertext: data.token_ciphertext, tokenIv: data.token_iv, accessExpiresAt: data.access_expires_at } : null;
  }

  async save(userId: string, platform: ConnPlatform, p: ConnectionPatch) {
    const row: Record<string, unknown> = { profile_id: userId, platform, updated_at: new Date().toISOString() };
    const map: Record<keyof ConnectionPatch, string> = {
      status: 'status', accountLabel: 'account_label', externalUserId: 'external_user_id', scopes: 'scopes',
      tokenCiphertext: 'token_ciphertext', tokenIv: 'token_iv', accessExpiresAt: 'access_expires_at', connectedAt: 'connected_at',
      lastSyncedAt: 'last_synced_at', lastError: 'last_error', errorCode: 'error_code',
    };
    for (const [k, col] of Object.entries(map)) if (k in p) row[col] = p[k as keyof ConnectionPatch];
    const { error } = await this.db.from('user_connections').upsert(row, { onConflict: 'profile_id,platform' });
    if (error) throw error;
  }

  async replaceItems(userId: string, platform: ConnPlatform, items: PersonalItem[]) {
    const now = new Date().toISOString();
    const rows = items.map((i) => ({
      profile_id: userId, platform, kind: i.kind, external_id: i.externalId, course_id: i.courseId ?? null, course_name: i.courseName ?? null,
      title: i.title.slice(0, 500), body: i.body ?? null, author: i.author ?? null, due_at: i.dueAt ?? null, ends_at: i.endsAt ?? null,
      published_at: i.publishedAt ?? null, url: i.url ?? null, link_kind: i.linkKind ?? (i.url ? 'direkte' : null), course_url: i.courseUrl ?? null, submission_status: i.submissionStatus ?? null, submitted_at: i.submittedAt ?? null, grade: i.grade ?? null,
      score: i.score ?? null, points_possible: i.pointsPossible ?? null, synced_at: now,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.db.from('external_items').upsert(rows.slice(i, i + 500), { onConflict: 'profile_id,platform,kind,external_id' });
      if (error) throw error;
    }
    // Fjern det som ikke lenger finnes i kilden (slettet oppgave, avsluttet emne)
    const { error } = await this.db.from('external_items').delete().eq('profile_id', userId).eq('platform', platform).lt('synced_at', now);
    if (error) throw error;
  }

  async remove(userId: string, platform: ConnPlatform) {
    await this.db.from('external_items').delete().eq('profile_id', userId).eq('platform', platform);
    await this.db.from('user_connections').delete().eq('profile_id', userId).eq('platform', platform);
  }
}
