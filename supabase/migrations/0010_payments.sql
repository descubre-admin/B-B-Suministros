create table if not exists public.sale_payments (
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 amount numeric(14,2) not null check(amount>0), method text not null default 'transfer' check(method in('cash','transfer','card','other')),
 note text, paid_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists sale_payments_sale_id_idx on public.sale_payments(sale_id);
alter table public.sale_payments enable row level security;
drop policy if exists "payments own rows" on public.sale_payments;
create policy "payments own rows" on public.sale_payments for all using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.sales s where s.id=sale_payments.sale_id and s.user_id=auth.uid()));
