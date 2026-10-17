alter table public.profiles
  add column if not exists organization text not null default '',
  add column if not exists about text not null default '';

create table if not exists public.saved_products (
  customer_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create index if not exists saved_products_customer_idx
  on public.saved_products (customer_id, created_at desc);

alter table public.saved_products enable row level security;

drop policy if exists saved_products_select_owner on public.saved_products;
create policy saved_products_select_owner on public.saved_products
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists saved_products_insert_owner on public.saved_products;
create policy saved_products_insert_owner on public.saved_products
  for insert to authenticated
  with check (customer_id = auth.uid());

drop policy if exists saved_products_delete_owner on public.saved_products;
create policy saved_products_delete_owner on public.saved_products
  for delete to authenticated
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (customer_id = auth.uid() or public.owns_supplier(supplier_id) or public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'saved_products'
     ) then
    alter publication supabase_realtime add table public.saved_products;
  end if;
end;
$$;
