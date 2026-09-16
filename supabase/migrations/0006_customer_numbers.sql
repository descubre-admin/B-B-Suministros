create sequence if not exists public.customer_number_seq start 1;
alter table public.customers add column if not exists customer_number bigint;
update public.customers set customer_number = nextval('public.customer_number_seq') where customer_number is null;
alter table public.customers alter column customer_number set default nextval('public.customer_number_seq');
alter table public.customers alter column customer_number set not null;
create unique index if not exists customers_customer_number_idx on public.customers(customer_number);
