-- Free way: accounts, audit and usage schema (Postgres / Supabase).
-- Apply once in the Supabase SQL editor or with psql. Free way also creates these tables
-- itself (CREATE TABLE IF NOT EXISTS) when DATABASE_URL points at the database.
--
-- Row-level security: RLS is enabled on every table with NO policies, so the public
-- anon/authenticated API keys cannot read or write anything. Free way's server connects
-- with the database connection string (DATABASE_URL), whose role bypasses RLS. Never put
-- that connection string in the browser or in chat.

create table if not exists users (
  id text primary key,
  google_sub text unique,
  email text,
  name text,
  created_at double precision not null,
  last_login_at double precision,
  disabled integer not null default 0
);

create table if not exists sessions (
  id_hash text primary key,          -- sha256 of the session cookie id, never the cookie itself
  user_id text not null,
  created_at double precision not null,
  expires_at double precision not null,
  ip text,
  user_agent text
);

create table if not exists login_events (
  id text primary key,
  user_id text,
  email text,
  name text,
  at double precision not null,
  ip text,
  user_agent text,
  success integer not null
);

create table if not exists projects_meta (
  kind text not null,                -- 'project' or 'agent'
  obj_id text not null,
  owner_id text not null,
  created_at double precision not null,
  primary key (kind, obj_id)
);

create table if not exists usage_events (
  id text primary key,
  user_id text not null,
  kind text not null,
  amount double precision not null,
  at double precision not null
);

create table if not exists ad_events (
  id text primary key,
  user_id text not null,
  kind text not null,
  ad_id text,
  at double precision not null
);

create table if not exists error_log (
  id text primary key,
  at double precision not null,
  source text not null,
  level text not null,
  message text not null,
  user_id text,
  path text
);

create index if not exists login_events_user on login_events (user_id, at);
create index if not exists projects_meta_owner on projects_meta (owner_id, kind);
create index if not exists usage_events_user on usage_events (user_id, at);
create index if not exists error_log_at on error_log (at);

alter table users enable row level security;
alter table sessions enable row level security;
alter table login_events enable row level security;
alter table projects_meta enable row level security;
alter table usage_events enable row level security;
alter table ad_events enable row level security;
alter table error_log enable row level security;
