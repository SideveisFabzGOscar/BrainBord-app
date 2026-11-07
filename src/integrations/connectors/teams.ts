import { clientCredentialsToken, requestJson } from '../http';
import { classifyByTitle, httpsOrNull, isTestType, stripHtml } from '../normalize';
import { IntegrationError, type Connector, type ConnectorContext, type NormalizeResult } from '../types';

/**
 * Microsoft Teams / Microsoft 365 Education via Microsoft Graph (offisielt API).
 * Krever en app-registrering i skolens Entra ID med applikasjonstillatelsene
 *   EduAssignments.Read.All og EduRoster.ReadBasic.All
 * og administratorsamtykke fra skoleeier.
 */
interface GraphClass { id: string; displayName: string; classCode?: string | null; externalId?: string | null }
interface GraphAssignment {
  id: string; displayName: string; status?: string;
  instructions?: { content?: string } | null;
  dueDateTime?: string | null; assignedDateTime?: string | null; createdDateTime?: string | null; webUrl?: string | null;
}
export interface TeamsRaw { classes: { cls: GraphClass; assignments: GraphAssignment[] }[] }

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const teamsConnector: Connector<TeamsRaw> = {
  platform: 'teams',
  displayName: 'Microsoft Teams / M365 Education',
  authType: 'oauth2_client_credentials',
  docsUrl: 'https://learn.microsoft.com/graph/api/resources/educationassignment',

  status({ env, config }) {
    const missing = [
      !(config.tenantId || env.MS_TENANT_ID) && 'MS_TENANT_ID',
      !env.MS_CLIENT_ID && 'MS_CLIENT_ID',
      !env.MS_CLIENT_SECRET && 'MS_CLIENT_SECRET',
    ].filter(Boolean) as string[];
    return {
      configured: missing.length === 0,
      missing,
      accessNote: 'Krever app-registrering i skolens Microsoft Entra ID og administratorsamtykke for '
        + 'EduAssignments.Read.All / EduRoster.ReadBasic.All.',
    };
  },

  async fetchRaw(ctx: ConnectorContext) {
    const st = this.status(ctx);
    if (!st.configured) throw new IntegrationError('NOT_CONFIGURED', `Mangler: ${st.missing.join(', ')}`);
    const tenant = String(ctx.config.tenantId ?? ctx.env.MS_TENANT_ID);
    const token = await clientCredentialsToken(
      ctx.fetch, `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      ctx.env.MS_CLIENT_ID!, ctx.env.MS_CLIENT_SECRET!, 'https://graph.microsoft.com/.default', ctx.logger,
    );
    const headers = { Authorization: `Bearer ${token}` };
    const classes = await pageAll<GraphClass>(ctx, `${GRAPH}/education/classes?$top=100`, headers);
    ctx.logger.info(`Fant ${classes.length} klasser i Microsoft 365`);
    const out: TeamsRaw['classes'] = [];
    for (const cls of classes) {
      try {
        const assignments = await pageAll<GraphAssignment>(
          ctx, `${GRAPH}/education/classes/${cls.id}/assignments?$top=100`, headers);
        out.push({ cls, assignments });
      } catch (err) {
        // Én klasse som feiler skal ikke stoppe hele synkroniseringen
        ctx.logger.error(`Kunne ikke hente oppgaver for klasse ${cls.displayName}`, String(err));
      }
    }
    return { classes: out };
  },

  normalize(raw): NormalizeResult {
    const res: NormalizeResult = { activities: [], absences: [], errors: [] };
    for (const { cls, assignments } of raw.classes) {
      for (const a of assignments) {
        if (a.status === 'draft') continue; // utkast er ikke publisert for elever
        if (!a.dueDateTime) { res.errors.push({ row: a.id, message: `"${a.displayName}" mangler frist – hoppet over` }); continue; }
        const type = classifyByTitle(a.displayName, 'innlevering');
        res.activities.push({
          externalId: `teams:${a.id}`,
          kind: isTestType(type) ? 'test' : 'assignment',
          activityType: type,
          title: a.displayName,
          description: stripHtml(a.instructions?.content),
          subjectCode: cls.classCode || cls.externalId || null,
          subjectName: cls.displayName,
          startsAt: a.assignedDateTime ?? null,
          dueAt: a.dueDateTime,
          url: httpsOrNull(a.webUrl), courseExternalId: cls.id,
        });
      }
    }
    return res;
  },
};

async function pageAll<T>(ctx: ConnectorContext, url: string, headers: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let next: string | null = url;
  let guard = 0;
  while (next && guard++ < 50) {
    const { data } = await requestJson<{ value: T[]; '@odata.nextLink'?: string }>(ctx.fetch, next, ctx.logger, { headers });
    all.push(...(data?.value ?? []));
    next = data?.['@odata.nextLink'] ?? null;
  }
  return all;
}
