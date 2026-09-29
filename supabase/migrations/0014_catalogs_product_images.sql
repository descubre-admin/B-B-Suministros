-- Imágenes de productos y catálogos comerciales
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists image_source_url text;
alter table public.products add column if not exists description text;

create table if not exists public.catalogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  logo_url text,
  show_prices boolean not null default true,
  show_brand boolean not null default true,
  show_sku boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position integer not null default 0,
  unique(catalog_id, product_id)
);

alter table public.catalogs enable row level security;
alter table public.catalog_items enable row level security;
create policy "authenticated catalogs" on public.catalogs for all to authenticated using (true) with check (true);
create policy "authenticated catalog items" on public.catalog_items for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

create policy "authenticated product image uploads" on storage.objects
for insert to authenticated with check (bucket_id = 'product-images');
create policy "authenticated product image updates" on storage.objects
for update to authenticated using (bucket_id = 'product-images') with check (bucket_id = 'product-images');
create policy "authenticated product image deletes" on storage.objects
for delete to authenticated using (bucket_id = 'product-images');
create policy "public product image reads" on storage.objects
for select to public using (bucket_id = 'product-images');
