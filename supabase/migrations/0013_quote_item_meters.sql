-- Metros opcionales por unidad en presupuestos (rollos, bobinas, mangueras, etc.)
alter table public.quote_items
  add column if not exists meters_per_unit numeric(14,2),
  add column if not exists total_meters numeric(14,2);

-- Si el módulo de ventas ya está instalado, conserva también esta información al confirmar la venta.
do $$
begin
  if to_regclass('public.sale_items') is not null then
    alter table public.sale_items add column if not exists meters_per_unit numeric(14,2);
    alter table public.sale_items add column if not exists total_meters numeric(14,2);
  end if;
end $$;
