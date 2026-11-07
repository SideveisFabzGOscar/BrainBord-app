# Brainbord

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

Testbrukere (syntetiske, passord `Brainbord!2026`):

| Rolle | E-post |
|---|---|
| Elev (Emma, 2STA) | `elev@skolehub.test` |
| Lærer (matematikk, 2STA + 2STB) | `laerer.matte@skolehub.test` |
| Skoleadministrator | `admin@skolehub.test` |
| Foresatt (verifisert for Emma) | `forelder@skolehub.test` |
| Admin på en annen skole (separasjonstest) | `admin@lindas.test` |

Tester:

```bash
npm test                                  # 42 enhetstester: integrasjoner, OAuth, direkte lenker, samling, assistent
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:test   # tilgangsregler (RLS)
npm run typecheck
```

---

## Status: hva er hva

### ✅ Implementert og testet

| Del | Hvordan det er verifisert |
|---|---|
| Databaseskjema (14 tabeller + `activities`-visning) med relasjoner, flere skoler/klasser/skoleår | Migrasjoner kjørt mot ekte PostgreSQL 16 |
| Row Level Security for alle tabeller og roller | `supabase/tests/rls_test.sql`: 16 testgrupper bestått (elev, lærer, foresatt, uverifisert foresatt, skoleseparasjon, admin, GDPR, personlige tilkoblinger, løst-markeringer, egen status, elev kan ikke legge ut oppgaver/prøver) |
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

## Personlige tilkoblinger: iSkole, Canvas og Teams

Hver bruker kobler sin **egen** konto under **Integrasjoner → Mine tilkoblinger**. Innlogging skjer hos tjenesten selv (OAuth 2.0); Brainbord ser aldri passord, og tofaktor gjøres hos leverandøren. Alt samles i **Samlet oversikt**, **Mine oppgaver** og **Assistent**.

| | iSkole | Canvas LMS | Microsoft Teams for Education |
|---|---|---|---|
| Offisiell tilgang | **Ingen dokumentert API** (undersøkt i dokumentasjonen til Barman Hanssen AS) | OAuth 2.0 med Developer Key | Microsoft identity platform (OAuth 2.0 + PKCE), Graph Education API |
| Hentes | Ingenting direkte. Fravær vises når skolen importerer det | Fag, oppgaver, innleveringsstatus, quiz, karakter/poeng, kunngjøringer, kalender, innboks | Klasser, oppgaver, innleveringsstatus, poeng (kun med `EduAssignments.Read`) |
| Tillatelser | – | Bare lesing: `url:GET\|…` for courses, assignments, announcements, calendar_events, conversations, users | `User.Read`, `EduRoster.ReadBasic`, `EduAssignments.ReadBasic`, `offline_access` |
| Status i appen | «Ikke tilkoblet» + forklaring | Koble til / Synkroniser / Koble fra | Koble til / Synkroniser / Koble fra |

**Sikkerhet i tilkoblingene**
* Tokens krypteres med AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), bundet til bruker og tjeneste, og tokenkolonnene kan ikke leses av noen innlogget bruker (kolonnerettigheter i databasen).
* OAuth-state og PKCE-verifier ligger i en kryptert, httpOnly-cookie som er bundet til brukeren og utløper etter 10 minutter.
* Tokens sendes bare i `Authorization`-headeren, aldri i URL-er, frontend eller logger.
* Utløpt token fornyes automatisk. Avvist fornyelse gir «Tilkobling feilet» og beskjed om å koble til på nytt.
* 401 = utløpt, 403 = manglende tillatelse (vises som advarsel for den delen), 429 = venter etter `Retry-After`.
* «Koble fra» tilbakekaller tokenet hos Canvas og sletter tokens og alle hentede data. Microsoft har ikke tilbakekalling av ett enkelt token; brukeren kan fjerne appen på myapps.microsoft.com.
* Hentede data er bare synlige for brukeren selv. Verken admin eller foresatte kan se dem (testet).
* Like oppgaver i Canvas, Teams og Brainbord slås sammen (samme fristdag og lik tittel), og alle kilder vises.

**AI-assistent:** Oppsummerer, prioriterer, lager ukeplan og oppsummerer kunngjøringer. Uten `ANTHROPIC_API_KEY` brukes bare regelbaserte svar beregnet direkte fra dataene. Med nøkkel formulerer en språkmodell svaret, men hvert svar kontrolleres: ukjente referanser, datoer som ikke finnes i dataene og nevnte karakterer/fravær gjør at AI-svaret forkastes. Fravær og karakterer sendes ikke til AI-tjenesten.

### Hva som er testet, og hva som ikke er det
* ✅ OAuth-flyt, tokenkryptering, state/PKCE, fornyelse, feilhåndtering, frakobling og datakonvertering for Canvas og Teams: **testet mot simulerte API-svar** som følger leverandørenes dokumentasjon.
* ✅ At brukere bare ser egne tilkoblinger og data, og ikke kan lese tokens: **testet mot ekte PostgreSQL** med RLS.
* ✅ Sammenslåing av duplikater, prioritering, ukeplan og assistentens validering: enhetstester.
* ❌ **Ikke testet mot ekte Canvas eller Microsoft 365.** Det krever nøklene under. Første ekte test bør gjøres med en testelev.
* ❌ Next.js-sidene er typesjekket, men ikke kjørt i nettleser i utviklingsmiljøet.

### Dette mangler for at tilkoblingene skal virke på din skole
1. **Canvas:** Skolens Canvas-administrator må opprette en *API Developer Key* med redirect-URI `https://<din-app>/api/connect/canvas/callback` og slå den på. Du får `CANVAS_CLIENT_ID` og `CANVAS_CLIENT_SECRET`, og trenger `CANVAS_BASE_URL` (f.eks. `https://skolenavn.instructure.com`). Håndhever nøkkelen scopes, må lesetilgangene i tabellen over velges.
2. **Microsoft Teams:** Skolens IT må registrere en app i Microsoft Entra ID (web-plattform, redirect-URI `https://<din-app>/api/connect/teams/callback`), lage en klienthemmelighet, legge til de delegerte tillatelsene over og **gi administratorsamtykke** (`EduAssignments.ReadBasic` krever det). Sett `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`. Karakterer krever i tillegg `EduAssignments.Read` og `MS_INCLUDE_GRADES=true`.
3. **iSkole:** Skoleeier (fylkeskommune/kommune) må spørre Barman Hanssen AS om en godkjent integrasjon eller API-tilgang. Inntil da kan skolen importere fravær med CSV under Skolens integrasjoner. Timeplan fra iSkole kan ikke vises uten dette.
4. **Generelt:** `APP_URL` (https), `TOKEN_ENCRYPTION_KEY`, migrasjon `20261107000005_user_connections.sql` kjørt, og oppdatert personvernkonsekvensvurdering (DPIA) for innhenting fra nye kilder. Bruker dere AI-assistenten med nøkkel, trengs databehandleravtale med AI-leverandøren.
5. **Ikke inkludert:** Teams-kanalmeldinger og chat (krever bredere tillatelser enn nødvendig), og timeplan fra Outlook-kalender.

## Direkte navigering til oppgaver og prøver

Alle oppgaver og prøver har en **«Åpne oppgave»/«Åpne prøve»**-knapp som går rett til riktig side i kildesystemet (ny fane). Knappen finnes i Samlet oversikt (smart oversikt med kommende prøver, innleveringer, forfalte og leverte), Mine oppgaver, årshjulet og assistenten.

| Kilde | Hvor lenken kommer fra | Hvis direkte lenke mangler |
|---|---|---|
| Canvas | `html_url` på oppgaven/quizen fra Canvas-API-et | Canvas-startsiden (`CANVAS_BASE_URL`) med forklaring |
| Teams | `webUrl` (offisiell dyplenke). Listen `/education/me/assignments` gir ofte `null`, så lenken hentes fra `GET /education/classes/{id}/assignments/{id}` | Teams-startsiden med forklaring |
| iSkole | Ingen API. Lenke finnes bare hvis skolen importerer den (kolonnen `lenke` i CSV) | `ISKOLE_PORTAL_URL` hvis satt, ellers vises oppgaven i Brainbord med forklaring |
| Skolens import (Canvas/Teams på skolenivå) | Lagres i `assignments.source_url` / `tests.source_url` | Som over |

**Regler som håndheves i koden:**
* Ingen URL-er konstrueres. Emne- og meldingslenker i Canvas brukes ikke, fordi API-et ikke gir dem.
* Lenker må være https og peke til riktig systems domene (`CANVAS_BASE_URL`-verten, `teams.microsoft.com`, iSkole-portalens vert). Andre lenker forkastes, så en manipulert oppgave ikke kan sende eleven til en falsk innloggingsside. Databasen avviser ikke-https-lenker.
* Oppgave-ID, fag-ID og kilde lagres sammen med hver lenke (`external_id`, `course_id`/`source_course_id`, `platform`/`source_platform`, `link_kind`).
* Innlogging skjer i kildesystemet. Brainbord åpner bare siden.
* Teams-lenken åpner oppgavevisningen i Teams. Lenke direkte til selve innleveringen finnes bare i Graph beta, og brukes derfor ikke.

**Assistenten** forstår spørsmål som «Når har jeg neste prøve?», «Vis meg matteinnleveringen», «Hvor finner jeg engelskleksa?», «Åpne prøven jeg har på fredag» og «Hvilke oppgaver må jeg levere denne uken?». Den søker i dine egne data (fag, type, dag, uke) og viser treffene med «Åpne»-knapper. Knappene lages fra lagrede lenker, aldri av en språkmodell. Finnes ingen treff, sier den det.

**Testet:** vertssjekk, reserveløsninger, valg av beste lenke ved duplikater, Teams-dyplenkeoppslag, Canvas uten konstruerte lenker, CSV-lenker, og alle fem eksempelspørsmålene (enhetstester). Databasebegrensningene er testet mot PostgreSQL. **Ikke testet** mot ekte Canvas/Teams, og iSkole-lenker kan ikke hentes automatisk uten avtale med leverandøren.

## Skygger

Alle skygger styres av fem variabler, så de kan endres eller fjernes på ett sted. Gjelder både elevportalen (BrainBord) og lærerportalen (ClassFlow).

| Variabel | Nivå | Brukes på |
|---|---|---|
| `--shadow-1` | Lav | Alle kort (`.card`: statistikkort, tabeller, skjemaer, kolonner), primærknapper, valgt fane i årshjulet |
| `--shadow-2` | Løftet | Primærknapper ved hover, fagkort ved hover, ukekort i årshjulet ved hover, innloggingsvalg ved hover (demo: også logoen på startsiden) |
| `--shadow-3` | Svevende | Bjellepanelet, verktøytips i årshjulet, varslinger (toast) |
| `--shadow-4` | Flytende | Dialogbokser, detaljpanelet, mobilmenyen |
| `--shadow-header` | Topplinje | Topplinjen øverst |

* **App:** variablene står i `src/app/globals.css` (`:root` for lyst tema, `.dark` for mørkt), med en oversikt nederst i filen. Komponentene bruker klassene `shadow-low`, `shadow-lift`, `shadow-pop`, `shadow-float` og `shadow-header`.
* **Demo:** variablene står øverst i `<style>` i `demo/skolehub-demo.html`, med samme oversikt som kommentar.
* **Fjerne alle skygger:** sett de fem variablene til `none` (i både lyst og mørkt tema).
* **Fjerne én type:** sett bare den variabelen til `none`, f.eks. `--shadow-1: none;` fjerner skyggen på alle kort og knapper.
* Fokusringer (blå ring rundt aktive felt) og markeringen av dagens dato i ukevisningen er ikke skygger, og påvirkes ikke.

## Arkitektur

```
src/
  app/
    (app)/            sidene i venstremenyen + actions.ts (server actions)
    api/              integrasjoner/sync, import/csv, documents, gdpr, admin/users
    login/
  components/         årshjul, tabeller, skjemaer, diagrammer
  connections/        personlige tilkoblinger: én modul per tjeneste
    canvas.ts, teams.ts, iskole.ts   OAuth + henting + konvertering
    service.ts        tilkobling, synk, tokenfornyelse, frakobling
    vault.ts          kryptering av tokens, OAuth-state og PKCE
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
* **Bare lærere og admin kan legge ut oppgaver og prøver.** Elever og foresatte har lesetilgang. Eleven kan fortsatt sette egen status og huke av oppgaver som løst. Håndheves tre steder: knappene vises ikke (`year-wheel.tsx`, `activity-table.tsx`), serverfunksjonen avviser (`createActivity` i `actions.ts`), og databasen nekter (migrasjon `…0010_students_read_only.sql`).
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
