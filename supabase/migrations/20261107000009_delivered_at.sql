-- Når oppgaven ble levert i Canvas/Teams (fra API-et). Brukes til å sortere
-- leverte oppgaver med sist leverte øverst.
alter table public.external_items add column if not exists submitted_at timestamptz;
