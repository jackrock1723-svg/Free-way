-- Free way: semantic code search with pgvector (Postgres / Supabase). Apply after 001_free_way_init.sql.
-- Supabase: Database -> Extensions -> enable "vector" (or run the CREATE EXTENSION line below once).
-- The embedding size must match the embedder: the default offline hash embedder uses 256 dimensions
-- (FW_EMBEDDER=hash). If you switch to a local model (FW_EMBEDDER=ollama, e.g. nomic-embed-text = 768),
-- create the column with that size instead and re-index.

create extension if not exists vector;

create table if not exists code_chunks (
  id          bigserial primary key,
  owner_id    text not null,              -- users.id of the project owner ("owner" for the local owner)
  project_id  text not null,
  path        text not null,              -- path inside the project; secret files are never indexed
  start_line  integer not null,
  model       text not null,              -- embedder name, e.g. hash-v1-256
  content_sha text,
  preview     text,                       -- first non-empty line, for result lists
  embedding   vector(256) not null,
  updated_at  double precision not null
);

create index if not exists code_chunks_owner_project_path on code_chunks (owner_id, project_id, path);
create index if not exists code_chunks_embedding_hnsw on code_chunks using hnsw (embedding vector_cosine_ops);

-- Row level security: on, with no policies. Only the Free way server (service role / direct DB connection)
-- reads and writes code chunks; browsers never query this table directly. If you later expose it through
-- Supabase's REST API, add a policy such as:
--   create policy "own chunks" on code_chunks for select using (owner_id = auth.uid()::text);
alter table code_chunks enable row level security;
