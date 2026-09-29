-- Trazabilidad de listas de proveedores en los productos de B&B
alter table public.products add column if not exists supplier_name text;
alter table public.products add column if not exists supplier_price numeric(14,2);
alter table public.products add column if not exists supplier_source_page text;
alter table public.products add column if not exists supplier_catalog_date date;

create index if not exists products_supplier_name_idx on public.products (supplier_name);
