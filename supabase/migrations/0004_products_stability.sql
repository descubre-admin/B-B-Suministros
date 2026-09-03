-- B&B Suministros
-- 0004: estabilización de Products + RLS para el flujo web.

-- La columna category de texto se mantiene por ahora porque la UI MVP ya la usa.
alter table public.products
  add column if not exists category text;

-- Hacemos explícito el default auth.uid() para que inserts autenticados
-- no dependan exclusivamente del trigger set_user_id().
alter table public.products
  alter column user_id set default auth.uid();

alter table public.customers
  alter column user_id set default auth.uid();

alter table public.categories
  alter column user_id set default auth.uid();

-- Reafirmamos RLS de products sin desactivarlo.
alter table public.products enable row level security;

drop policy if exists "products own rows" on public.products;
create policy "products own rows"
on public.products
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists products_name_idx
  on public.products (name);

create index if not exists products_category_idx
  on public.products (category);

create index if not exists products_sku_search_idx
  on public.products (sku);

-- Fuerza a PostgREST/Supabase a refrescar el esquema inmediatamente.
notify pgrst, 'reload schema';
