alter table public.quotes
  add column if not exists custom_customer_name text;
