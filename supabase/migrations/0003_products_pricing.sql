
-- B&B Suministros
-- Corrección para la estructura original de products.
--
-- suggested_price YA es una columna GENERATED ALWAYS.
-- No debe agregarse, actualizarse ni enviarse manualmente desde la app.

alter table public.products
  add column if not exists category text;

create index if not exists products_name_idx
  on public.products using btree (name);

create index if not exists products_category_idx
  on public.products using btree (category);

-- sku ya existe en la estructura original.
create index if not exists products_sku_search_idx
  on public.products using btree (sku);

-- No hacemos UPDATE de suggested_price:
-- PostgreSQL lo recalcula automáticamente cada vez que cambian
-- cost o markup_percent.
