# SkoleHub

Samler oppgaver, innleveringer, prøver, fravær og dokumentasjon fra flere læringsplattformer i én database, med et interaktivt årshjul som hovedvisning.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Lucide · Recharts · Supabase (PostgreSQL, Auth, Storage, Realtime) · Row Level Security

---

## Kom i gang

Krever Node.js 20+, Docker (for lokal Supabase) og Git.

```bash
npm install
npx supabase start            # starter lokal Postgres/Auth/Storage, kjører migrasjoner + seed
cp .env.example .env.local    # lim inn URL og nøkler som `supabase start` skriver ut
openssl rand -base64 32       # lim inn som DOCUMENT_ENCRYPTION_KEY i .env.local
npm run dev                   # http://localhost:3000
```

Testbrukere (syntetiske, passord `SkoleHub!2026`):

| Rolle | E-post |
|---|---|
| Elev (Emma, 2STA) | `elev@skolehub.test` |
| Lærer (matematikk, 2STA + 2STB) | `laerer.matte@skolehub.test` |
| Skoleadministrator | `admin@skolehub.test` |
| Foresatt (verifisert for Emma) | `forelder@skolehub.test` |
| Admin på en annen skole (separasjonstest) | `admin@lindas.test` |

Tester:

```bash
npm test                                  # integrasjonsarkitekturen (9 tester)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:test   # tilgangsregler (RLS)
npm run typecheck
```

---

## Status: hva er hva

### ✅ Implementert og testet

| Del | Hvordan det er verifisert |
|---|---|
| Databaseskjema (14 tabeller + `activities`-visning) med relasjoner, flere skoler/klasser/skoleår | Migrasjoner kjørt mot ekte PostgreSQL 16 |
| Row Level Security for alle tabeller og roller | `supabase/tests/rls_test.sql`: 9 testgrupper bestått (elev, lærer, foresatt, uverifisert foresatt, skoleseparasjon, admin, GDPR) |
| Revisjonslogg (triggere på fravær, dokumenter, karakterer, elever, foresatte) + logging av dokumentåpning | Del av RLS-testene |
| GDPR-innsyn (eksport) og sletting med revisjonsspor | Del av RLS-testene |
| Integrasjonsmotor: connector-grensesnitt, normalisering, validering, duplikatkontroll (i batch og mot DB), retry/backoff, feil per rad, logging med maskerte e-poster | `tests/integrations.test.ts`: 9 tester bestått |
| Teams- og Canvas-connector mot offisielle API-er (OAuth/token, paginering) | Testet mot simulerte API-svar, **ikke** mot ekte tenant |
| CSV-import (aktiviteter og fravær), norske datoformater, sommer-/vintertid | Enhetstester |
| Next.js-app: alle 10 sider i menyen, server actions, API-ruter, auth-middleware, lyst/mørkt tema, responsiv | Typesjekket. **Ikke kjørt i nettleser** i utviklingsmiljøet (pakkeinstallasjon var blokkert der), så kjør `npm run build` første gang og meld fra om feil |

### 🧪 Testdata
* `supabase/seed.sql` er generert av `scripts/generate_seed.py`: 2 skoler, 3 klasser, 45 elever, 130 oppgaver, 42 prøver, ~1000 innleveringer, ~180 fraværsregistreringer. **Alle navn er syntetiske.**
* Dokumentasjonsradene i seed har ingen fil (vises som «Registrert uten fil»).
* **Testintegrasjon** (`mock`) lager syntetiske aktiviteter for å teste hele synk-løpet. Den er merket «Testmodus» i UI.

### 🔒 Krever ekstern tilgang (ingenting later som det fungerer)

| Plattform | Hva som trengs | Status i appen |
|---|---|---|
| Microsoft Teams / M365 Education | App-registrering i skolens Entra ID, tillatelsene `EduAssignments.Read.All` og `EduRoster.ReadBasic.All`, admin-samtykke. Sett `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`. | Kode ferdig, viser «Ikke tilkoblet» til nøkler finnes |
| Canvas | API-nøkkel/developer key fra skolens Canvas-admin. `CANVAS_BASE_URL`, `CANVAS_API_TOKEN`. | Kode ferdig, viser «Ikke tilkoblet» |
| itslearning | Partner-/integrasjonsavtale med skoleeier. Endepunkter og feltnavn er ikke offentlige, så de legges inn i integrasjonens konfig når dokumentasjon foreligger. | Rapporterer `NO_API_ACCESS`. Bruk CSV-eksport inntil videre |
| iSkole | Leverandøravtale via fylkeskommunen. Samme oppsett som itslearning. | Rapporterer `NO_API_ACCESS`. Bruk CSV |
| Feide-innlogging | Avtale med Sikt + SAML/OIDC-oppsett i Supabase Auth | Ikke satt opp. E-post/passord brukes nå |

Ingen scraping og ingen forsøk på å omgå innlogging.

---

## Arkitektur

```
src/
  app/
    (app)/            sidene i venstremenyen + actions.ts (server actions)
    api/              integrasjoner/sync, import/csv, documents, gdpr, admin/users
    login/
  components/         årshjul, tabeller, skjemaer, diagrammer
  integrations/
    types.ts          felles datastruktur + Connector-grensesnitt
    connectors/       teams, canvas, csv, partner-rest (itslearning/iSkole), mock
    sync-engine.ts    henting → normalisering → validering → duplikatkontroll → lagring → logg
    supabase-store.ts lagring i Postgres (upsert på unik nøkkel)
    registry.ts       ny plattform = ny connector-fil + én linje her
  lib/                session, datalasting, kryptering, formatering
supabase/
  migrations/         skjema, sikkerhet/RLS, lagring, realtime
  seed.sql            syntetiske data
  tests/rls_test.sql  tilgangstester
tests/                enhetstester for integrasjoner
demo/                 frittstående klikkbar demo (ingen server)
```

**Legge til en ny plattform:** lag `src/integrations/connectors/<navn>.ts` som implementerer `Connector` (`status`, `fetchRaw`, `normalize`), legg den i `registry.ts`, og legg verdien til i enum-typen `source_platform`.

**Årshjulet oppdateres automatisk:** siden abonnerer på Supabase Realtime for `assignments` og `tests` (følger RLS) og laster data på nytt når noe opprettes eller importeres.

### Tabellnavn

| Spesifikasjon | Tabell |
|---|---|
| Elever | `students` (+ `profiles` for innloggede brukere) |
| Skoler | `schools`, `school_years`, `classes` |
| Fag | `subjects` |
| Oppgaver | `assignments` (innlevering, oppgave, lekse, prosjekt, presentasjon, frist, annet) |
| Innleveringer | `submissions` |
| Prøver | `tests` (prøve, eksamen) + `test_results` |
| Fravær | `absences` |
| Sykemeldinger og dokumentasjon | `documents` |
| Integrasjoner | `integrations`, `sync_runs` |
| Tilgangslogg | `audit_log` |

---

## Sikkerhet og GDPR

* **Tilgang håndheves i databasen** (RLS), ikke i frontend. Alle skrivinger fra brukere går via brukerens egen klient.
* **Roller:** elev (egne data), lærer (klasser og fag de underviser, aldri helsedokumenter), skoleadministrator (egen skole), foresatt (kun med verifisert behandlingsgrunnlag og gyldig dato).
* **Ingen selvregistrering.** Nye brukere får laveste rolle; bare admin kan endre rolle/skole (trigger stopper forsøk).
* **Elever kan ikke sette karakter** eller status «Fullført» (trigger).
* **Sykemeldinger:** ingen diagnosefelt. Filer valideres på innhold (magic bytes), krypteres med AES-256-GCM på serveren, lagres i privat bucket uten klienttilgang. Hver nedlasting logges. Oppbevaringstid med automatisk sletting (`purge_expired_documents`, kjør med pg_cron).
* **Hemmeligheter** (API-nøkler) ligger bare i servermiljøet. Konfig-skjemaet avviser tekst som ser ut som hemmeligheter.
* **Logger** maskerer e-postadresser og fjerner query-parametere fra URL-er.
* **Sikkerhetshoder** (HSTS, X-Frame-Options, nosniff m.fl.) i `next.config.mjs`.

**Før produksjon:** DPIA (personvernkonsekvensvurdering), databehandleravtale med Supabase (velg EU-region), rutiner for arkivplikt før sletting, Feide-innlogging, pg_cron for oppbevaringstid, og penetrasjonstest.

---

## Kjente begrensninger

* Lærere kan ikke importere CSV (kun admin), og CSV-import av aktiviteter kan bare koble til eksisterende fag.
* Foresatt-tilgang registreres i `guardianships` av admin; det finnes ikke eget skjema for det ennå.
* Varsler vises i appen (bjella). E-post/push-varsler er ikke laget.
* Next.js-appen er ikke kjørt i nettleser under utviklingen. Den frittstående demoen i `demo/` er testet.
