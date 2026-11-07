#!/usr/bin/env python3
"""
Genererer supabase/seed.sql med SYNTETISKE testdata for Brainbord.
Ingen ekte personer. Alle navn er tilfeldig satt sammen.
Kjør:  python3 scripts/generate_seed.py > supabase/seed.sql
"""
import random, uuid, datetime as dt, json

random.seed(2026)
NS = uuid.UUID("6b1d6a2e-0000-4000-8000-5c0e1eb00000")
def uid(*parts): return str(uuid.uuid5(NS, "/".join(map(str, parts))))
def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

PASSWORD = "Brainbord!2026"   # kun for lokal utvikling/testbrukere
TODAY = dt.date(2026, 11, 7)
YEAR_START, YEAR_END = dt.date(2026, 8, 17), dt.date(2027, 6, 18)

out = []
w = out.append
w("-- AUTOGENERERT av scripts/generate_seed.py – SYNTETISKE TESTDATA, ingen ekte personer")
w("begin;")

# ---------- Skoler ----------
schools = [
    (uid("school", 1), "Fjordvik videregående skole (TEST)", "Testfylke fylkeskommune", "999000001"),
    (uid("school", 2), "Lindås vgs (TEST, separasjonstest)", "Testfylke fylkeskommune", "999000002"),
]
for s in schools:
    w(f"insert into public.schools (id,name,organization,org_number) values ({q(s[0])},{q(s[1])},{q(s[2])},{q(s[3])});")
SCHOOL = schools[0][0]

years = {}
for i, s in enumerate(schools):
    yid = uid("year", i)
    years[s[0]] = yid
    w(f"insert into public.school_years (id,school_id,label,starts_on,ends_on,is_current) values "
      f"({q(yid)},{q(s[0])},'2026/2027',{q(YEAR_START.isoformat())},{q(YEAR_END.isoformat())},true);")

classes = {"2STA": (uid("class", "2STA"), SCHOOL), "2STB": (uid("class", "2STB"), SCHOOL),
           "1STA-L": (uid("class", "1STA-L"), schools[1][0])}
for name, (cid, sch) in classes.items():
    w(f"insert into public.classes (id,school_id,school_year_id,name) values ({q(cid)},{q(sch)},{q(years[sch])},{q(name)});")

# ---------- Auth-brukere ----------
def auth_user(user_id, email, name):
    meta = json.dumps({"full_name": name})
    w("insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,"
      "raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,"
      "email_change_token_new,email_change) values ("
      f"'00000000-0000-0000-0000-000000000000',{q(user_id)},'authenticated','authenticated',{q(email)},"
      f"crypt({q(PASSWORD)}, gen_salt('bf')),now(),'{{\"provider\":\"email\",\"providers\":[\"email\"]}}',"
      f"{q(meta)},now(),now(),'','','','');")
    w("insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values ("
      f"{q(user_id)},{q(user_id)},{q(user_id)},"
      f"{q(json.dumps({'sub': user_id, 'email': email}))},'email',now(),now(),now());")

def profile(user_id, school, role, name, email):
    # handle_new_user har laget profilen; sett rolle/skole som admin ville gjort
    w(f"update public.profiles set role={q(role)}, school_id={q(school)}, full_name={q(name)} where id={q(user_id)};")

users = {
    "admin":   (uid("u", "admin"),   "admin@skolehub.test",   "Siri Admin (TEST)", "admin"),
    "t_nor":   (uid("u", "t_nor"),   "laerer.norsk@skolehub.test", "Kari Lunde", "teacher"),
    "t_mat":   (uid("u", "t_mat"),   "laerer.matte@skolehub.test", "Ola Berget", "teacher"),
    "t_nat":   (uid("u", "t_nat"),   "laerer.realfag@skolehub.test", "Ingrid Haugen", "teacher"),
    "t_his":   (uid("u", "t_his"),   "laerer.historie@skolehub.test", "Per Solberg", "teacher"),
    "elev":    (uid("u", "elev"),    "elev@skolehub.test",    "Emma Testesen", "student"),
    "elev2":   (uid("u", "elev2"),   "elev2@skolehub.test",   "Jonas Prøvesen", "student"),
    "forelder":(uid("u", "forelder"),"forelder@skolehub.test","Lise Testesen", "parent"),
    "admin2":  (uid("u", "admin2"),  "admin@lindas.test",     "Admin Lindås (TEST)", "admin"),
}
for key, (i, email, name, role) in users.items():
    auth_user(i, email, name)
for key, (i, email, name, role) in users.items():
    sch = schools[1][0] if key == "admin2" else (None if role == "parent" else SCHOOL)
    profile(i, sch, role, name, email)

# ---------- Fag ----------
subject_defs = [
    ("Norsk", "NOR1260", "t_nor"), ("Matematikk R1", "MAT1001", "t_mat"),
    ("Fysikk 1", "FYS1001", "t_nat"), ("Kjemi 1", "KJE1001", "t_nat"),
    ("Historie", "HIS1010", "t_his"), ("Engelsk fordypning", "ENG3001", "t_nor"),
    ("Kroppsøving", "KRO1018", "t_his"),
]
subjects = {}
for cname in ("2STA", "2STB"):
    cid = classes[cname][0]
    for name, code, t in subject_defs:
        sid = uid("subj", cname, code)
        subjects[(cname, code)] = sid
        w(f"insert into public.subjects (id,school_id,class_id,name,code,teacher_id) values "
          f"({q(sid)},{q(SCHOOL)},{q(cid)},{q(name)},{q(code)},{q(users[t][0])});")
lsub = uid("subj", "1STA-L", "NOR")
w(f"insert into public.subjects (id,school_id,class_id,name,code,teacher_id) values "
  f"({q(lsub)},{q(schools[1][0])},{q(classes['1STA-L'][0])},'Norsk','NOR1260',null);")

# ---------- Elever ----------
first = ["Nora","Emil","Sofie","Lukas","Ella","Filip","Maja","Henrik","Ingrid","Oskar","Leah","Jakob",
         "Thea","Aksel","Selma","Mathias","Alma","Sander","Frida","Elias","Vilde","Noah","Hedda","Isak"]
last = ["Bakken","Strand","Lie","Moen","Dahl","Aune","Vik","Eide","Rønning","Holm","Sæther","Myhre"]
students = {}
main_sid = uid("stud", "elev"); students["elev"] = main_sid
w(f"insert into public.students (id,profile_id,school_id,class_id,full_name,email) values "
  f"({q(main_sid)},{q(users['elev'][0])},{q(SCHOOL)},{q(classes['2STA'][0])},'Emma Testesen','elev@skolehub.test');")
sid2 = uid("stud", "elev2"); students["elev2"] = sid2
w(f"insert into public.students (id,profile_id,school_id,class_id,full_name,email) values "
  f"({q(sid2)},{q(users['elev2'][0])},{q(SCHOOL)},{q(classes['2STB'][0])},'Jonas Prøvesen','elev2@skolehub.test');")
class_students = {"2STA": [main_sid], "2STB": [sid2]}
for cname, n in (("2STA", 23), ("2STB", 19)):
    for k in range(n):
        name = f"{random.choice(first)} {random.choice(last)}"
        s = uid("stud", cname, k)
        class_students[cname].append(s)
        w(f"insert into public.students (id,school_id,class_id,full_name) values "
          f"({q(s)},{q(SCHOOL)},{q(classes[cname][0])},{q(name)});")
lstud = uid("stud", "lindas", 0)
w(f"insert into public.students (id,school_id,class_id,full_name) values "
  f"({q(lstud)},{q(schools[1][0])},{q(classes['1STA-L'][0])},'Elev på annen skole');")

# Foresatt: verifisert for Emma, gyldig til 18-årsdag
w(f"insert into public.guardianships (parent_profile_id,student_id,legal_basis,verified_at,valid_until) values "
  f"({q(users['forelder'][0])},{q(main_sid)},'Foreldreansvar, elev under 18 år (opplæringslova)',now(),'2027-09-30');")

# ---------- Oppgaver og prøver gjennom hele skoleåret ----------
def rand_date(start, end):
    d = start + dt.timedelta(days=random.randint(0, (end - start).days))
    while d.weekday() >= 5: d += dt.timedelta(days=1)
    return d

templates = {
    "innlevering": ["Fagtekst", "Analyse", "Rapport", "Drøftingstekst", "Skriftlig innlevering"],
    "oppgave": ["Oppgavesett", "Arbeidsark", "Øvingsoppgaver", "Refleksjonslogg"],
    "lekse": ["Les kapittel", "Lekse uke", "Gloser", "Forbered diskusjon"],
    "prosjekt": ["Tverrfaglig prosjekt", "Gruppeprosjekt", "Forskningsprosjekt"],
    "presentasjon": ["Muntlig presentasjon", "Fremføring", "Pitch"],
    "frist": ["Påmeldingsfrist", "Valg av tema", "Frist for disposisjon"],
}
weights = [("innlevering", 5), ("oppgave", 5), ("lekse", 4), ("prosjekt", 1), ("presentasjon", 2), ("frist", 1)]
kinds = [k for k, n in weights for _ in range(n)]

assignment_rows, submission_rows, test_rows, result_rows = [], [], [], []
for cname in ("2STA", "2STB"):
    for name, code, t in subject_defs:
        subj = subjects[(cname, code)]
        n = 10 if code != "KRO1018" else 4
        for i in range(n):
            kind = random.choice(kinds)
            due = rand_date(YEAR_START + dt.timedelta(days=7), YEAR_END - dt.timedelta(days=14))
            hour = random.choice([9, 12, 15, 23])
            start = due - dt.timedelta(days=random.choice([3, 7, 14, 21]) if kind in ("prosjekt", "innlevering") else 0)
            title = f"{random.choice(templates[kind])}: {name}" + (f" {random.randint(1,12)}" if kind == "lekse" else "")
            aid = uid("asg", cname, code, i)
            assignment_rows.append((aid, subj, title, kind, start, due, hour, cname))
        for i in range(3 if code != "KRO1018" else 1):
            d = rand_date(YEAR_START + dt.timedelta(days=20), YEAR_END - dt.timedelta(days=20))
            tid = uid("test", cname, code, i)
            test_rows.append((tid, subj, f"{'Kapittelprøve' if i else 'Heldagsprøve'} i {name}", "prove", d, cname))
        if code in ("NOR1260", "MAT1001"):
            test_rows.append((uid("exam", cname, code), subj, f"Eksamen {name}", "eksamen",
                              dt.date(2027, 5, 24 if code == "NOR1260" else 27), cname))

for aid, subj, title, kind, start, due, hour, cname in assignment_rows:
    status = "ikke_startet"
    w("insert into public.assignments (id,school_id,subject_id,title,description,activity_type,starts_at,due_at,"
      "source_platform,external_id) values ("
      f"{q(aid)},{q(SCHOOL)},{q(subj)},{q(title)},{q('Syntetisk testoppgave. Les instruksen i læringsplattformen.')},"
      f"{q(kind)},{q(start.isoformat()+' 08:00+01')},{q(due.isoformat()+f' {hour:02d}:00+01')},"
      f"{q(random.choice(['itslearning','teams','manual']))},null);")
    # innleveringer for alle elever i klassen
    for s in class_students[cname]:
        if due < TODAY:
            st = random.choices(["fullfort", "levert", "pagar", "ikke_startet"], [55, 30, 8, 7])[0]
        elif (due - TODAY).days < 21:
            st = random.choices(["ikke_startet", "pagar", "levert"], [45, 40, 15])[0]
        else:
            st = random.choices(["ikke_startet", "pagar"], [85, 15])[0]
        if st == "ikke_startet" and due >= TODAY: continue   # ingen rad = ikke startet
        # Levering kan aldri ligge i framtiden
        sub_at = q((min(due, TODAY - dt.timedelta(days=1)) - dt.timedelta(days=random.randint(0, 2))).isoformat() + " 20:00+01") if st in ("levert", "fullfort") else "null"
        grade = q(str(random.choice([3, 4, 4, 5, 5, 6]))) if st == "fullfort" else "null"
        assess = q("God innsats. Se kommentarer i dokumentet.") if st == "fullfort" else "null"
        w(f"insert into public.submissions (student_id,assignment_id,submitted_at,status,assessment,grade) values "
          f"({q(s)},{q(aid)},{sub_at},{q(st)},{assess},{grade});")

for tid, subj, title, ttype, d, cname in test_rows:
    w("insert into public.tests (id,school_id,subject_id,title,description,test_type,test_date,source_platform) values ("
      f"{q(tid)},{q(SCHOOL)},{q(subj)},{q(title)},{q('Pensum oppgis av faglærer. Syntetiske testdata.')},"
      f"{q(ttype)},{q(d.isoformat()+' 08:30+01')},{q(random.choice(['iskole','manual']))});")
    if d < TODAY:
        for s in class_students[cname]:
            w(f"insert into public.test_results (test_id,student_id,result,status) values "
              f"({q(tid)},{q(s)},{q(str(random.choice([2,3,4,4,5,5,6])))},'fullfort');")

# Personlige aktiviteter for Emma
for i, (title, d) in enumerate([("Trening før cupkamp", dt.date(2026, 11, 14)),
                                 ("Lag studieplan for eksamen", dt.date(2027, 4, 20))]):
    w("insert into public.assignments (id,school_id,title,activity_type,due_at,student_id,source_platform) values ("
      f"{q(uid('personal', i))},{q(SCHOOL)},{q(title)},'annet',{q(d.isoformat()+' 18:00+01')},{q(main_sid)},'manual');")

# ---------- Fravær ----------
abs_types = [("sykdom", 4), ("legetime", 2), ("permisjon", 1), ("skoleaktivitet", 1), ("udokumentert", 3)]
abs_kinds = [k for k, n in abs_types for _ in range(n)]
subj_codes = [c for _, c, _ in subject_defs]
doc_id_n = 0
for cname in ("2STA", "2STB"):
    for s in class_students[cname]:
        n = random.randint(4, 10) if s == main_sid else random.randint(0, 8)
        for k in range(n):
            d = rand_date(YEAR_START, TODAY - dt.timedelta(days=1))
            typ = random.choice(abs_kinds)
            fh = random.choice([8, 9, 10, 12, 13])
            hrs = random.choice([1, 1.5, 2, 3])
            to_h = fh + hrs
            to_str = f"{int(to_h):02d}:{'30' if to_h % 1 else '00'}"
            doc = {"udokumentert": "ikke_dokumentert", "sykdom": random.choice(["godkjent", "venter", "ikke_dokumentert"]),
                   "legetime": "godkjent", "permisjon": "godkjent", "skoleaktivitet": "godkjent"}[typ]
            aid = uid("abs", s, k)
            subj = subjects[(cname, random.choice(subj_codes))]
            w("insert into public.absences (id,student_id,school_id,subject_id,date,from_time,to_time,absence_type,hours,"
              "documentation_status,source_platform) values ("
              f"{q(aid)},{q(s)},{q(SCHOOL)},{q(subj)},{q(d.isoformat())},'{fh:02d}:00',{q(to_str)},{q(typ)},{hrs},{q(doc)},'iskole');")
            if s == main_sid and typ in ("sykdom", "legetime") and doc in ("godkjent", "venter"):
                doc_id_n += 1
                w("insert into public.documents (id,student_id,school_id,absence_id,date,document_type,documentation_status) values ("
                  f"{q(uid('doc', doc_id_n))},{q(s)},{q(SCHOOL)},{q(aid)},{q(d.isoformat())},"
                  f"{q('legeerklaering' if typ == 'legetime' else 'egenmelding')},{q(doc)});")

# ---------- Integrasjoner ----------
for plat, name, status in [("teams", "Microsoft Teams / M365 Education", "ikke_tilkoblet"),
                           ("itslearning", "itslearning", "ikke_tilkoblet"),
                           ("iskole", "iSkole", "ikke_tilkoblet"),
                           ("canvas", "Canvas LMS", "ikke_tilkoblet"),
                           ("csv", "CSV-import", "tilkoblet"),
                           ("mock", "Testintegrasjon (syntetiske data)", "testmodus")]:
    w(f"insert into public.integrations (school_id,platform,display_name,status) values ({q(SCHOOL)},{q(plat)},{q(name)},{q(status)});")

w("-- Merk testskolene som eksempeldata (vises tydelig i grensesnittet)")
w("update public.schools set is_demo = true;")
w("commit;")
print("\n".join(out))
