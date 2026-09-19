-- B&B Suministros — ventas confirmadas desde presupuestos
create sequence if not exists public.sale_number_seq start 1;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number bigint not null default nextval('public.sale_number_seq'),
  quote_id uuid unique references public.quotes(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  profit numeric(14,2) not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed','delivered','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  line_cost numeric(14,2) not null default 0,
  line_profit numeric(14,2) not null default 0
);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "sales own rows" on public.sales;
create policy "sales own rows" on public.sales for all
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "sale items through own sale" on public.sale_items;
create policy "sale items through own sale" on public.sale_items for all
using (exists(select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = auth.uid()))
with check (exists(select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = auth.uid()));
