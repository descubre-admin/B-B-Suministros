-- B&B Suministros — Proveedores y reglas de costo
-- Esta migración NO altera products ni otras tablas existentes.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  code text,
  phone text,
  notes text,
  pricing_mode text not null default 'unit'
    check (pricing_mode in ('unit','meter','pack','list_discount','multiplier_discount','manual')),
  default_multiplier numeric(14,4) not null default 1 check (default_multiplier >= 0),
  default_pack_quantity numeric(14,4) not null default 1 check (default_pack_quantity > 0),
  default_discount_percent numeric(8,2) not null default 0 check (default_discount_percent >= 0),
  default_surcharge_percent numeric(8,2) not null default 0 check (default_surcharge_percent >= 0),
  default_markup_percent numeric(8,2) not null default 20 check (default_markup_percent >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_supplier_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  pricing_mode text not null default 'unit'
    check (pricing_mode in ('unit','meter','pack','list_discount','multiplier_discount','manual')),
  base_price numeric(14,4) not null default 0 check (base_price >= 0),
  multiplier numeric(14,4) not null default 1 check (multiplier >= 0),
  pack_quantity numeric(14,4) not null default 1 check (pack_quantity > 0),
  discount_percent numeric(8,2) not null default 0 check (discount_percent >= 0),
  surcharge_percent numeric(8,2) not null default 0 check (surcharge_percent >= 0),
  calculated_cost numeric(14,2) not null default 0 check (calculated_cost >= 0),
  purchase_unit text,
  is_preferred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, supplier_id)
);

alter table public.suppliers enable row level security;
alter table public.product_supplier_costs enable row level security;

drop policy if exists "suppliers own rows" on public.suppliers;
create policy "suppliers own rows"
on public.suppliers for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "product supplier costs own rows" on public.product_supplier_costs;
create policy "product supplier costs own rows"
on public.product_supplier_costs for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid())
  and exists (select 1 from public.suppliers s where s.id = supplier_id and s.user_id = auth.uid())
);

create index if not exists suppliers_user_name_idx on public.suppliers(user_id, name);
create index if not exists product_supplier_costs_product_idx on public.product_supplier_costs(product_id);
create index if not exists product_supplier_costs_supplier_idx on public.product_supplier_costs(supplier_id);
create unique index if not exists product_supplier_one_preferred_idx
  on public.product_supplier_costs(product_id)
  where is_preferred = true;
