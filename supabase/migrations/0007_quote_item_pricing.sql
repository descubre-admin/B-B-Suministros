-- B&B Suministros — conserva el cálculo interno de cada renglón del presupuesto
alter table public.quote_items
  add column if not exists base_price numeric(14,2) not null default 0 check (base_price >= 0),
  add column if not exists supplier_discount_percent numeric(8,2) not null default 0 check (supplier_discount_percent >= 0 and supplier_discount_percent <= 100),
  add column if not exists profit_percent numeric(8,2) not null default 0 check (profit_percent >= 0);
