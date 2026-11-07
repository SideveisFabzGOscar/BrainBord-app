import { clientCredentialsToken, requestJson } from '../http';
import { classifyByTitle, httpsOrNull, isTestType, stripHtml } from '../normalize';
import {
  IntegrationError, type AbsenceType, type Connector, type ConnectorContext, type NormalizeResult, type Platform,
} from '../types';

/**
 * Connector for plattformer der API-tilgang KUN gis via partner-/leverandøravtale
 * (itslearning og iSkole). Endepunkter og feltnavn er ikke offentlig dokumentert,
 * så de settes i integrations.config når skolen har fått avtale og dokumentasjon:
 *
 *   {
 *     "baseUrl": "https://…",                 // fra leverandør
 *     "tokenUrl": "https://…/oauth2/token",   // fra leverandør
 *     "scope": "…",
 *     "activitiesPath": "/…",                 // valgfri
 *     "absencesPath": "/…",                   // valgfri
 *     "fields": { "id": "Id", "title": "Title", "due": "Deadline", … }
 *   }
 *
 * Inntil avtale foreligger, rapporterer connectoren NO_API_ACCESS
 * (den later aldri som den er tilkoblet). Bruk CSV-eksport fra plattformen.
 */
type FieldMap = Partial<Record<'id' | 'title' | 'description' | 'due' | 'start' | 'subject' | 'type' | 'url'
  | 'email' | 'date' | 'from' | 'to' | 'hours' | 'absenceType' | 'documented', string>>;

export interface PartnerRaw { activities: Record<string, unknown>[]; absences: Record<string, unknown>[]; fields: FieldMap }

const DEFAULT_FIELDS: FieldMap = {
  id: 'id', title: 'title', description: 'description', due: 'deadline', start: 'start', subject: 'courseCode',
  type: 'type', url: 'url', email: 'studentEmail', date: 'date', from: 'from', to: 'to', hours: 'hours',
  absenceType: 'absenceType', documented: 'documented',
};

export function createPartnerRestConnector(opts: {
  platform: Extract<Platform, 'itslearning' | 'iskole'>;
  displayName: string;
  envPrefix: string;
  accessNote: string;
}): Connector<PartnerRaw> {
  const P = opts.envPrefix;
  return {
    platform: opts.platform,
    displayName: opts.displayName,
    authType: 'oauth2_client_credentials',

    status({ env, config }) {
      const missing = [
        !config.baseUrl && 'config.baseUrl (fra leverandør)',
        !config.tokenUrl && 'config.tokenUrl (fra leverandør)',
        !(config.activitiesPath || config.absencesPath) && 'config.activitiesPath/absencesPath',
        !env[`${P}_CLIENT_ID`] && `${P}_CLIENT_ID`,
        !env[`${P}_CLIENT_SECRET`] && `${P}_CLIENT_SECRET`,
      ].filter(Boolean) as string[];
      return { configured: missing.length === 0, missing, accessNote: opts.accessNote };
    },

    async fetchRaw(ctx: ConnectorContext) {
      const st = this.status(ctx);
      if (!st.configured) {
        throw new IntegrationError('NO_API_ACCESS',
          `${opts.displayName} krever partneravtale. Mangler: ${st.missing.join(', ')}. Bruk CSV-import inntil videre.`);
      }
      const cfg = ctx.config as Record<string, string> & { fields?: FieldMap };
      const token = await clientCredentialsToken(ctx.fetch, cfg.tokenUrl, ctx.env[`${P}_CLIENT_ID`]!,
        ctx.env[`${P}_CLIENT_SECRET`]!, cfg.scope ?? '', ctx.logger);
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const get = async (path?: string) => {
        if (!path) return [];
        const { data } = await requestJson<unknown>(ctx.fetch, cfg.baseUrl.replace(/\/$/, '') + path, ctx.logger, { headers });
        return Array.isArray(data) ? data : ((data as { items?: unknown[]; value?: unknown[] })?.items
          ?? (data as { value?: unknown[] })?.value ?? []);
      };
      return {
        activities: (await get(cfg.activitiesPath)) as Record<string, unknown>[],
        absences: (await get(cfg.absencesPath)) as Record<string, unknown>[],
        fields: { ...DEFAULT_FIELDS, ...(cfg.fields ?? {}) },
      };
    },

    normalize(raw): NormalizeResult {
      const f = raw.fields;
      const s = (o: Record<string, unknown>, k?: string) => (k && o[k] != null ? String(o[k]) : null);
      const res: NormalizeResult = { activities: [], absences: [], errors: [] };
      raw.activities.forEach((o, i) => {
        const id = s(o, f.id), title = s(o, f.title), due = s(o, f.due);
        if (!id || !title || !due || isNaN(Date.parse(due))) {
          res.errors.push({ row: id ?? i, message: 'Mangler id, tittel eller gyldig frist' }); return;
        }
        const type = classifyByTitle(`${s(o, f.type) ?? ''} ${title}`, 'innlevering');
        res.activities.push({
          externalId: `${opts.platform}:${id}`, kind: isTestType(type) ? 'test' : 'assignment', activityType: type,
          title, description: stripHtml(s(o, f.description)), subjectCode: s(o, f.subject),
          startsAt: s(o, f.start), dueAt: new Date(due).toISOString(), url: httpsOrNull(s(o, f.url)),
        });
      });
      raw.absences.forEach((o, i) => {
        const id = s(o, f.id), email = s(o, f.email), date = s(o, f.date), hours = Number(s(o, f.hours));
        if (!id || !email || !date || !Number.isFinite(hours)) {
          res.errors.push({ row: id ?? i, message: 'Ufullstendig fraværsrad' }); return;
        }
        const t = (s(o, f.absenceType) ?? '').toLowerCase();
        const known: AbsenceType[] = ['sykdom', 'legetime', 'permisjon', 'skoleaktivitet', 'annet', 'udokumentert'];
        res.absences.push({
          externalId: `${opts.platform}:${id}`, studentEmail: email.toLowerCase(), date: date.slice(0, 10),
          fromTime: s(o, f.from), toTime: s(o, f.to), hours,
          absenceType: (known as string[]).includes(t) ? (t as AbsenceType) : 'annet',
          subjectCode: s(o, f.subject), documented: /^(true|1|ja|yes)$/i.test(s(o, f.documented) ?? ''),
        });
      });
      return res;
    },
  };
}

export const itslearningConnector = createPartnerRestConnector({
  platform: 'itslearning', displayName: 'itslearning', envPrefix: 'ITSLEARNING',
  accessNote: 'itslearning gir API-tilgang via partner-/integrasjonsavtale med skoleeier. '
    + 'Inntil avtale og dokumentasjon foreligger: eksporter oppgaver til CSV og bruk CSV-import.',
});

export const iskoleConnector = createPartnerRestConnector({
  platform: 'iskole', displayName: 'iSkole', envPrefix: 'ISKOLE',
  accessNote: 'iSkole-data (fravær, vurdering) hentes via leverandørens integrasjon etter avtale med fylkeskommunen. '
    + 'Inntil da: eksporter fravær til CSV og bruk CSV-import.',
});
