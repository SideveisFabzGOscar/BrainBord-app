import { nextLink, requestJson } from '../http';
import { classifyByTitle, httpsOrNull, isTestType, stripHtml } from '../normalize';
import { IntegrationError, type Connector, type ConnectorContext, type NormalizeResult } from '../types';

/**
 * Canvas LMS via offisielt REST API (Instructure).
 * Krever en API-nøkkel (eller OAuth2-developer key) utstedt av skolens
 * Canvas-administrator, samt base-URL til skolens Canvas-instans.
 */
interface CanvasCourse { id: number; name: string; course_code?: string }
interface CanvasAssignment {
  id: number; name: string; description?: string | null;
  due_at?: string | null; unlock_at?: string | null;
  is_quiz_assignment?: boolean; submission_types?: string[]; published?: boolean; html_url?: string;
}
export interface CanvasRaw { courses: { course: CanvasCourse; assignments: CanvasAssignment[] }[] }

export const canvasConnector: Connector<CanvasRaw> = {
  platform: 'canvas',
  displayName: 'Canvas LMS',
  authType: 'api_token',
  docsUrl: 'https://canvas.instructure.com/doc/api/assignments.html',

  status({ env, config }) {
    const missing = [
      !(config.baseUrl || env.CANVAS_BASE_URL) && 'CANVAS_BASE_URL',
      !env.CANVAS_API_TOKEN && 'CANVAS_API_TOKEN',
    ].filter(Boolean) as string[];
    return {
      configured: missing.length === 0, missing,
      accessNote: 'Krever API-nøkkel/developer key fra skolens Canvas-administrator.',
    };
  },

  async fetchRaw(ctx: ConnectorContext) {
    const st = this.status(ctx);
    if (!st.configured) throw new IntegrationError('NOT_CONFIGURED', `Mangler: ${st.missing.join(', ')}`);
    const base = String(ctx.config.baseUrl ?? ctx.env.CANVAS_BASE_URL).replace(/\/$/, '');
    const headers = { Authorization: `Bearer ${ctx.env.CANVAS_API_TOKEN}` };
    const courses = await pageAll<CanvasCourse>(ctx, `${base}/api/v1/courses?enrollment_state=active&per_page=100`, headers);
    ctx.logger.info(`Fant ${courses.length} aktive emner i Canvas`);
    const out: CanvasRaw['courses'] = [];
    for (const course of courses) {
      try {
        out.push({ course, assignments: await pageAll<CanvasAssignment>(ctx, `${base}/api/v1/courses/${course.id}/assignments?per_page=100`, headers) });
      } catch (err) {
        ctx.logger.error(`Kunne ikke hente oppgaver for emne ${course.name}`, String(err));
      }
    }
    return { courses: out };
  },

  normalize(raw): NormalizeResult {
    const res: NormalizeResult = { activities: [], absences: [], errors: [] };
    for (const { course, assignments } of raw.courses) {
      for (const a of assignments) {
        if (a.published === false) continue;
        if (!a.due_at) { res.errors.push({ row: a.id, message: `"${a.name}" mangler frist – hoppet over` }); continue; }
        const quiz = a.is_quiz_assignment || a.submission_types?.includes('online_quiz');
        const type = classifyByTitle(a.name, quiz ? 'prove' : 'innlevering');
        res.activities.push({
          externalId: `canvas:${a.id}`,
          kind: isTestType(type) ? 'test' : 'assignment',
          activityType: type,
          title: a.name,
          description: stripHtml(a.description),
          subjectCode: course.course_code ?? String(course.id),
          subjectName: course.name,
          startsAt: a.unlock_at ?? null,
          dueAt: a.due_at,
          url: httpsOrNull(a.html_url), courseExternalId: String(course.id),
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
    const { data, headers: h } = await requestJson<T[]>(ctx.fetch, next, ctx.logger, { headers });
    all.push(...(data ?? []));
    next = nextLink(h.get('link'));
  }
  return all;
}
