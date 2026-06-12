-- Reference tables (plan U2/U11). Version label is part of every key:
-- refreshes INSERT new version sets and never mutate prior versions, so old
-- findings' ref_version_map stamps stay resolvable forever (data #4).
-- Seed files are manually downloaded (CMS click-through gates automated
-- fetch) into supabase/seed/raw/<version>/ and ingested by
-- scripts/refresh-reference.ts (insert-only, idempotent per version).

create table public.ref_ncci_ptp (
  version text not null,          -- e.g. '2026Q2'
  code1 text not null,
  code2 text not null,
  modifier_allowed boolean not null default false,
  primary key (version, code1, code2)
);

create table public.ref_mue (
  version text not null,
  code text not null,
  max_units int not null,
  primary key (version, code)
);

create table public.ref_medicare_rates (
  version text not null,          -- e.g. 'PFS2026'
  code text not null,
  national_rate_cents bigint not null, -- PFS national unadjusted; facility lines report skipped_no_data for C10 until OPPS lands (review F5)
  primary key (version, code)
);

create table public.ref_carc_rarc (
  version text not null,
  code text not null,
  description text not null,
  liability_class text, -- e.g. 'provider_writeoff' for timely-filing class codes (C6, U16)
  primary key (version, code)
);

create table public.ref_fap_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  hospital_name text not null,
  state text not null,
  threshold_free_fpl numeric,     -- income threshold as multiple of federal poverty level
  threshold_discount_fpl numeric,
  source_url text,
  unique (version, hospital_name, state)
);

alter table public.ref_ncci_ptp enable row level security;
alter table public.ref_mue enable row level security;
alter table public.ref_medicare_rates enable row level security;
alter table public.ref_carc_rarc enable row level security;
alter table public.ref_fap_policies enable row level security;

-- Read for any authenticated user; writes are service-role only (no policies).
create policy ref_ncci_read on public.ref_ncci_ptp for select to authenticated using (true);
create policy ref_mue_read on public.ref_mue for select to authenticated using (true);
create policy ref_rates_read on public.ref_medicare_rates for select to authenticated using (true);
create policy ref_carc_read on public.ref_carc_rarc for select to authenticated using (true);
create policy ref_fap_read on public.ref_fap_policies for select to authenticated using (true);
