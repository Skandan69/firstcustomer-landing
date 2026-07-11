create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_id text not null,
  name text not null, category text not null default '', address text not null default '', city text not null default '',
  state text not null default '', country text not null default '', latitude double precision, longitude double precision,
  phone text not null default '', email text not null default '', website text not null default '', rating numeric,
  review_count integer, business_status text not null default '', source_url text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider, provider_id)
);
create table public.saved_leads (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id, business_id)
);
create table public.search_history (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, location text not null, category text not null default '',
  radius_km integer not null, provider text not null, result_count integer not null default 0, created_at timestamptz not null default now()
);
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null, location text not null,
  category text not null default '', radius_km integer not null, provider text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(workspace_id, name)
);
create table public.lead_notes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, saved_lead_id uuid not null references public.saved_leads(id) on delete cascade,
  content text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.activity_log (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, event_type text not null,
  business_id uuid references public.businesses(id) on delete set null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index saved_leads_workspace_idx on public.saved_leads(workspace_id, created_at desc);
create index search_history_workspace_idx on public.search_history(workspace_id, created_at desc);
create index saved_searches_workspace_idx on public.saved_searches(workspace_id, created_at desc);
create index lead_notes_workspace_idx on public.lead_notes(workspace_id, saved_lead_id);
create index activity_log_workspace_idx on public.activity_log(workspace_id, created_at desc);
alter table public.businesses enable row level security;
alter table public.saved_leads enable row level security;
alter table public.search_history enable row level security;
alter table public.saved_searches enable row level security;
alter table public.lead_notes enable row level security;
alter table public.activity_log enable row level security;
-- No public policies are created. Only server-side service-role requests may access these tables.
