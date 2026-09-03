create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  brand text,
  sku text,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  markup_percent numeric(8,2) not null default 20 check (markup_percent >= 0),
  suggested_price numeric(14,2) generated always as (round(cost * (1 + markup_percent / 100.0), 2)) stored,
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  stock numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_user_sku_idx on public.products(user_id, sku) where sku is not null;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  city text,
  notes text,
  created_at timestamptz not null default now()
);

create sequence if not exists public.quote_number_seq start 1;
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number bigint not null default nextval('public.quote_number_seq'),
  customer_id uuid references public.customers(id) on delete set null,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  valid_until date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14,2) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default 'B&B Suministros',
  phone text,
  address text,
  city text,
  default_markup_percent numeric(8,2) not null default 20,
  quote_validity_hours integer not null default 48 check (quote_validity_hours > 0),
  updated_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.settings enable row level security;

drop policy if exists "categories own rows" on public.categories;
create policy "categories own rows" on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "products own rows" on public.products;
create policy "products own rows" on public.products for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "customers own rows" on public.customers;
create policy "customers own rows" on public.customers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "quotes own rows" on public.quotes;
create policy "quotes own rows" on public.quotes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "quote items through own quote" on public.quote_items;
create policy "quote items through own quote" on public.quote_items for all
using (exists(select 1 from public.quotes q where q.id = quote_items.quote_id and q.user_id = auth.uid()))
with check (exists(select 1 from public.quotes q where q.id = quote_items.quote_id and q.user_id = auth.uid()));
drop policy if exists "settings own row" on public.settings;
create policy "settings own row" on public.settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.set_user_id() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end; $$;

drop trigger if exists categories_set_user on public.categories;
create trigger categories_set_user before insert on public.categories for each row execute function public.set_user_id();
drop trigger if exists products_set_user on public.products;
create trigger products_set_user before insert on public.products for each row execute function public.set_user_id();
drop trigger if exists customers_set_user on public.customers;
create trigger customers_set_user before insert on public.customers for each row execute function public.set_user_id();
