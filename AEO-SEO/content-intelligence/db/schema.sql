-- Enable pgvector extension
create extension if not exists vector;

-- Articles table
create table if not exists articles (
  id bigint generated always as identity primary key,
  post_id text unique not null,
  title text not null,
  subtitle text,
  post_date timestamptz,
  type text,
  audience text,
  url_slug text,
  full_text_markdown text,
  word_count integer,
  created_at timestamptz default now()
);

-- Chunks table with vector embeddings
create table if not exists chunks (
  id bigint generated always as identity primary key,
  article_id bigint references articles(id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  heading text,
  token_count integer,
  embedding vector(1536),
  created_at timestamptz default now(),
  unique (article_id, chunk_index)
);

-- HNSW index for fast cosine similarity search
create index if not exists chunks_embedding_hnsw_idx
  on chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RPC function: match chunks by cosine similarity
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 15,
  similarity_threshold float default 0.5,
  exclude_article_id bigint default null
)
returns table (
  chunk_id bigint,
  article_id bigint,
  chunk_index integer,
  chunk_text text,
  heading text,
  article_title text,
  article_url_slug text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id as chunk_id,
    c.article_id,
    c.chunk_index,
    c.chunk_text,
    c.heading,
    a.title as article_title,
    a.url_slug as article_url_slug,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join articles a on a.id = c.article_id
  where
    (exclude_article_id is null or c.article_id != exclude_article_id)
    and 1 - (c.embedding <=> query_embedding) > similarity_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Weekly GA4 + GSC page-level metrics per article
create table if not exists article_metrics (
  id bigint generated always as identity primary key,
  url_slug text not null,
  week_start date not null,
  -- GA4 metrics
  pageviews integer default 0,
  sessions integer default 0,
  avg_engagement_time_seconds float default 0,
  bounce_rate float default 0,
  -- GSC metrics
  clicks integer default 0,
  impressions integer default 0,
  ctr float default 0,
  avg_position float default 0,
  created_at timestamptz default now(),
  unique (url_slug, week_start)
);

create index if not exists article_metrics_slug_idx on article_metrics(url_slug);
create index if not exists article_metrics_week_idx on article_metrics(week_start);

-- GSC query-level data per article per week
create table if not exists article_queries (
  id bigint generated always as identity primary key,
  url_slug text not null,
  week_start date not null,
  query text not null,
  clicks integer default 0,
  impressions integer default 0,
  ctr float default 0,
  avg_position float default 0,
  created_at timestamptz default now(),
  unique (url_slug, week_start, query)
);

create index if not exists article_queries_slug_idx on article_queries(url_slug);
create index if not exists article_queries_week_idx on article_queries(week_start);
