create table if not exists public.website_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  business_provider text not null default '',
  business_provider_id text not null default '',
  business_name text not null default '',
  website text not null,
  opportunity_score integer not null check (opportunity_score between 0 and 100),
  health_score integer not null check (health_score between 0 and 100),
  summary jsonb not null,
  audited_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, website)
);

create index if not exists website_audits_workspace_idx on public.website_audits(workspace_id, audited_at desc);
alter table public.website_audits enable row level security;
-- No public policies are created. Service-role access remains server-side only.
