-- 054_eva_builder_foundation.sql — Eva gap closure foundation
-- Adds data-driven price structure, coded BOQ catalog, traceable off-cuts, and revision/project merge
-- Read-only seed from Eva Aadisheshu 18-report / 20-step Retail Projects 974 — tenant-editable after

-- 1. Price structures + elements (mirrors Eva quotesPriceElements)
create table if not exists public.price_structures (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  name text not null, -- e.g. Retail Projects
  eva_price_structure_id int, -- 974
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.price_elements (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.price_structures(id) on delete cascade,
  ord int not null,
  name text not null,
  formula text not null,
  rate_text text not null,
  calculation_type_id int not null,
  effect_on_total int not null, -- 1, 0, -1
  show_in_quote boolean not null default true,
  show_in_report boolean not null default false
);
create index if not exists price_elements_structure_ord_idx on public.price_elements(structure_id, ord);

-- 2. Profile catalog (tenant-owned, Eva BOQ codes as seed)
create table if not exists public.profile_catalog (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  code text not null, -- PA62-UB-03 etc
  name text not null,
  stock_mm int not null,
  color text not null,
  system text not null,
  kind text not null check (kind in ('profile','ri','hardware','glass')),
  created_at timestamptz not null default now(),
  unique(client_id, code)
);

-- 3. Off-cut inventory — replaces BuilderClient offcuts text field
create table if not exists public.offcut_inventory (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  profile_code text not null,
  length_mm int not null check (length_mm > 0),
  stock_mm int not null default 6000,
  source_quotation_id uuid,
  is_reusable boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists offcut_client_profile_idx on public.offcut_inventory(client_id, profile_code);

-- 4. Quotation revisions + project openings (Eva revisionNumber/parentQuoteId + project merge)
create table if not exists public.quotation_revisions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  revision_number int not null,
  parent_revision_id uuid references public.quotation_revisions(id) on delete set null,
  snapshot jsonb not null, -- full quotation + measured/unmeasured + window_json + bom_json
  created_at timestamptz not null default now(),
  unique(quotation_id, revision_number)
);
create table if not exists public.project_openings (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  project_name text not null, -- e.g. Aadisheshu
  opportunity_code text, -- KPR-OP-00000424
  opening_code text not null, -- 01
  quotation_id uuid references public.quotations(id) on delete set null,
  window_json jsonb not null,
  bom_json jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_openings_client_project_idx on public.project_openings(client_id, project_name);

-- Seed KPR default Retail Projects + PROMINANCE profiles (idempotent)
do $$
declare
  ps_id uuid;
begin
  if not exists (select 1 from public.price_structures where client_id='kprupvc' and eva_price_structure_id=974) then
    insert into public.price_structures (client_id, name, eva_price_structure_id, is_default)
    values ('kprupvc','Retail Projects',974,true) returning id into ps_id;
    insert into public.price_elements (structure_id, ord, name, formula, rate_text, calculation_type_id, effect_on_total, show_in_quote, show_in_report) values
      (ps_id,1,'Profile Cost','#PROFILECOST','0.9',8,1,true,false),
      (ps_id,2,'Profile Wastage','@Profile Cost.value','0.9',1,1,true,false),
      (ps_id,3,'RI Cost','#RICOST','1',8,1,true,false),
      (ps_id,4,'RI Wastage','@RI Cost.value','5',1,1,true,false),
      (ps_id,5,'Hardware Cost','#HWCOST','1',8,1,true,false),
      (ps_id,6,'Glass Cost','#GLASSCOST','1',8,1,true,false),
      (ps_id,7,'Glass Wastage','@Glass Cost.value','5',1,1,true,false),
      (ps_id,8,'Total Raw Material Cost','@Profile Cost.value+@Profile Wastage.value+@RI Cost.value+@RI Wastage.value+@Hardware Cost.value+@Glass Cost.value+@Glass Wastage.value','1',8,0,true,false),
      (ps_id,9,'Fabrication Labour','#AreaSqftFg','70',9,1,true,false),
      (ps_id,10,'Installation Labour','#AreaSqftFg','50',9,1,true,false),
      (ps_id,11,'Sub Total Including Labour','@Total Raw Material Cost.value+@Fabrication Labour.value+@Installation Labour.value','1',8,0,true,false),
      (ps_id,12,'Profit','@Sub Total Including Labour.value','60',1,1,true,false),
      (ps_id,13,'Basic Value','@Sub Total Including Labour.value+@Profit.value','1',8,0,true,true),
      (ps_id,14,'Discount','@Basic Value.value','0',1,-1,true,true),
      (ps_id,15,'Sub Total','@Basic Value.value+@Discount.value','1',8,0,true,true),
      (ps_id,16,'Transportation Cost','1','1000',12,1,true,true),
      (ps_id,17,'Loading And Unloading','1','1000',12,1,true,true),
      (ps_id,18,'Total Project Cost','@Sub Total.value+@Transportation Cost.value+@Loading And Unloading.value','1',8,0,true,true),
      (ps_id,19,'GST','@Total Project Cost.value','18',1,1,true,true),
      (ps_id,20,'Grand Total','@Total Project Cost.value+@GST.value','1',8,0,true,true);
  end if;

  if not exists (select 1 from public.profile_catalog where client_id='kprupvc' and code='PS62-UF-02') then
    insert into public.profile_catalog (client_id, code, name, stock_mm, color, system, kind) values
      ('kprupvc','PA62-UB-03','62MM SLIDING SINGLE GLASS BEAD 24MM DGU',5800,'WHITE','PROMINANCE INVENTA SLIDING SERIES','profile'),
      ('kprupvc','PAM116','ALUMINIUM GUIDE RAIL',3000,'WHITE','PROMINANCE INVENTA SLIDING SERIES','profile'),
      ('kprupvc','PC50-UB-01','50MM CASEMENT SINGLE GLASS BEAD',5800,'WHITE','PROMINANCE INVENTA SLIDING SERIES','profile'),
      ('kprupvc','PS62-UF-02','112MM 3 TRACK SLIDING FRAME',5800,'WHITE','PROMINANCE INVENTA SLIDING SERIES','profile'),
      ('kprupvc','PS62-UO-05','SL INTERLOCK WINDOW PROFILE',6000,'WHITE','PROMINANCE INVENTA SLIDING SERIES','profile'),
      ('kprupvc','PS62-US-03','62MM SLIDING SASH 24MM DGU',5800,'WHITE','PROMINANCE INVENTA SLIDING SERIES','profile');
  end if;
end $$;
