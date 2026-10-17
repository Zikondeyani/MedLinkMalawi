alter type public.supplier_order_status add value if not exists 'cancelled';

create table if not exists public.refund_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  method text not null check (method in ('mobile_money', 'bank_account')),
  provider text not null check (btrim(provider) <> ''),
  account_name text not null check (btrim(account_name) <> ''),
  account_number text not null check (btrim(account_number) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refund_accounts_customer_idx
  on public.refund_accounts (customer_id, created_at);

alter table public.refund_accounts enable row level security;

drop policy if exists refund_accounts_select_owner on public.refund_accounts;
create policy refund_accounts_select_owner on public.refund_accounts
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists refund_accounts_insert_owner on public.refund_accounts;
create policy refund_accounts_insert_owner on public.refund_accounts
  for insert to authenticated
  with check (customer_id = auth.uid());

drop policy if exists refund_accounts_update_owner on public.refund_accounts;
create policy refund_accounts_update_owner on public.refund_accounts
  for update to authenticated
  using (customer_id = auth.uid() or public.is_admin())
  with check (customer_id = auth.uid() or public.is_admin());

drop policy if exists refund_accounts_delete_owner on public.refund_accounts;
create policy refund_accounts_delete_owner on public.refund_accounts
  for delete to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  supplier_order_id uuid not null unique references public.supplier_orders (id) on delete cascade,
  supplier_id text not null references public.suppliers (id) on delete restrict,
  customer_id uuid not null references auth.users (id) on delete cascade,
  order_number text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null default 'awaiting_account'
    check (status in ('awaiting_account', 'pending', 'processing', 'refunded')),
  refund_account_id uuid references public.refund_accounts (id) on delete restrict,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists refund_requests_customer_idx
  on public.refund_requests (customer_id, created_at desc);
create index if not exists refund_requests_status_idx
  on public.refund_requests (status, created_at);

alter table public.refund_requests enable row level security;

drop policy if exists refund_requests_select_owner on public.refund_requests;
create policy refund_requests_select_owner on public.refund_requests
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists refund_requests_update_admin on public.refund_requests;
create policy refund_requests_update_admin on public.refund_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists supplier_orders_select_owner on public.supplier_orders;
create policy supplier_orders_select_owner on public.supplier_orders
  for select to authenticated
  using (
    public.owns_supplier(supplier_id)
    or public.is_admin()
    or exists (
      select 1
        from public.orders o
       where o.id = supplier_orders.order_id
         and o.customer_id = auth.uid()
    )
  );

create or replace function public.guard_supplier_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status public.customer_order_status;
  v_order_customer uuid;
begin
  if public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at')
     is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Store order details cannot be changed after checkout.' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'completed' then
    select status, customer_id
      into v_order_status, v_order_customer
      from public.orders
     where id = new.order_id;
    if v_order_status = 'delivered' and v_order_customer = auth.uid() then
      return new;
    end if;
    raise exception 'Only the customer can confirm receipt after delivery.' using errcode = '42501';
  end if;

  if not public.owns_supplier(new.supplier_id) then
    raise exception 'You cannot update this store order.' using errcode = '42501';
  end if;

  select status
    into v_order_status
    from public.orders
   where id = new.order_id;

  if new.status = 'cancelled' then
    if v_order_status in ('out_for_delivery', 'delivered', 'cancelled') then
      raise exception 'A store order can only be cancelled before MedLink starts delivery.' using errcode = '42501';
    end if;
    if old.status not in ('new', 'confirmed', 'preparing', 'ready') then
      raise exception 'This store order can no longer be cancelled.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_order_status not in ('confirmed', 'preparing', 'ready') then
    raise exception 'This order is no longer awaiting store fulfilment.' using errcode = '42501';
  end if;

  if not (
    (old.status = 'new' and new.status = 'confirmed')
    or (old.status = 'confirmed' and new.status = 'preparing')
    or (old.status = 'preparing' and new.status = 'ready')
  ) then
    raise exception 'Store orders can only advance through confirmation, preparation and ready for pickup.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_orders_guard_status_change on public.supplier_orders;
create trigger supplier_orders_guard_status_change
  before update on public.supplier_orders
  for each row execute function public.guard_supplier_order_status_change();

create or replace function public.create_supplier_cancellation_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund_amount numeric(12, 2);
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select coalesce(sum(oi.price * oi.quantity), 0)
      into v_refund_amount
      from public.order_items oi
     where oi.order_id = new.order_id
       and oi.supplier_id = new.supplier_id;

    if v_refund_amount <= 0 then
      raise exception 'No refundable item subtotal was found for this store order.';
    end if;

    insert into public.refund_requests (
      order_id, supplier_order_id, supplier_id, customer_id, order_number, amount
    )
    values (
      new.order_id, new.id, new.supplier_id, new.customer_id, new.number, v_refund_amount
    )
    on conflict (supplier_order_id) do nothing;

    insert into public.notifications (
      type, title, message, icon, customer_id, customer_email, order_id, order_number
    ) values (
      'order',
      'Items cancelled from order ' || new.number,
      'A store cancelled its items. Choose a saved refund account to request a refund of the item subtotal.',
      'wallet',
      new.customer_id,
      new.customer_email,
      new.order_id,
      new.number
    );

    insert into public.notifications (
      type, title, message, icon, order_id, order_number
    ) values (
      'order',
      'Supplier cancellation needs refund',
      'A supplier cancelled part of order ' || new.number || '; the refund request is waiting for the customer to choose an account.',
      'wallet',
      new.order_id,
      new.number
    );
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_orders_create_cancellation_refund on public.supplier_orders;
create trigger supplier_orders_create_cancellation_refund
  after update of status on public.supplier_orders
  for each row execute function public.create_supplier_cancellation_refund();

create or replace function public.sync_order_status_from_supplier_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_next_status public.customer_order_status;
  v_active_count integer;
  v_all_accepted boolean;
  v_any_preparing boolean;
  v_all_ready boolean;
  v_changed_at timestamptz := now();
begin
  if new.status is not distinct from old.status or new.order_id is null then
    return new;
  end if;

  select * into v_order
    from public.orders
   where id = new.order_id
   for update;

  if v_order.id is null or v_order.status not in ('confirmed', 'preparing', 'ready') then
    return new;
  end if;

  select
    count(*),
    bool_and(status <> 'new'),
    bool_or(status = 'preparing'),
    bool_and(status in ('ready', 'completed'))
    into v_active_count, v_all_accepted, v_any_preparing, v_all_ready
    from public.supplier_orders
   where order_id = new.order_id
     and status <> 'cancelled';

  v_next_status := case
    when coalesce(v_active_count, 0) = 0 then 'cancelled'::public.customer_order_status
    when not coalesce(v_all_accepted, false) then 'confirmed'::public.customer_order_status
    when coalesce(v_any_preparing, false) then 'preparing'::public.customer_order_status
    when coalesce(v_all_ready, false) then 'ready'::public.customer_order_status
    else 'confirmed'::public.customer_order_status
  end;

  if v_next_status is distinct from v_order.status then
    update public.orders
       set status = v_next_status,
           timeline = (case
             when jsonb_typeof(v_order.timeline) = 'array' then v_order.timeline
             else '[]'::jsonb
           end) || jsonb_build_array(jsonb_build_object(
             'status', v_next_status,
             'at', v_changed_at,
             'note', case
               when v_next_status = 'cancelled' then 'All supplier portions were cancelled'
               else 'Status synchronized from store fulfilment'
             end
           )),
           updated_at = v_changed_at
     where id = new.order_id;
  end if;

  return new;
end;
$$;

create or replace function public.notify_customer_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.notification_type;
  v_icon text;
  v_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_type := case
    when new.status in ('out_for_delivery', 'delivered') then 'delivery'::public.notification_type
    else 'order'::public.notification_type
  end;
  v_icon := case when v_type = 'delivery' then 'truck' else 'package' end;
  v_label := replace(new.status::text, '_', ' ');

  insert into public.notifications (
    type, title, message, icon, customer_id, customer_email, order_id, order_number
  ) values (
    v_type, 'Order ' || new.number || ' ' || v_label,
    'Your order status is now ' || v_label || '.', v_icon,
    new.customer_id, new.customer_email, new.id, new.number
  );

  insert into public.notifications (
    type, title, message, icon, order_id, order_number
  ) values (
    v_type, 'Order ' || new.number || ' ' || v_label,
    'The order status is now ' || v_label || '.', v_icon, new.id, new.number
  );

  if new.status in ('out_for_delivery', 'delivered') then
    insert into public.notifications (
      type, title, message, icon, supplier_id, order_id, order_number
    )
    select v_type, 'Order ' || new.number || ' ' || v_label,
      'MedLink updated delivery status to ' || v_label || '.',
      v_icon, oi.supplier_id, new.id, new.number
    from (
      select distinct supplier_id from public.order_items where order_id = new.id
    ) oi;
  end if;

  if new.status = 'delivered' then
    update public.supplier_orders
       set status = 'completed', updated_at = now()
     where order_id = new.id
       and status not in ('completed', 'cancelled');
  end if;

  return new;
end;
$$;

create or replace function public.supplier_cancel_order(p_supplier_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_order public.supplier_orders;
  v_order_status public.customer_order_status;
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel a store order.' using errcode = '42501';
  end if;

  select * into v_supplier_order
    from public.supplier_orders
   where id = p_supplier_order_id
   for update;

  if v_supplier_order.id is null or not public.owns_supplier(v_supplier_order.supplier_id) then
    raise exception 'That store order was not found.' using errcode = '42501';
  end if;

  if v_supplier_order.customer_id is null then
    raise exception 'This order is not linked to a customer account and cannot create a refund request.';
  end if;

  select status into v_order_status
    from public.orders
   where id = v_supplier_order.order_id
   for update;

  if v_order_status in ('out_for_delivery', 'delivered', 'cancelled') then
    raise exception 'A store order can only be cancelled before MedLink starts delivery.';
  end if;

  if v_supplier_order.status not in ('new', 'confirmed', 'preparing', 'ready') then
    raise exception 'This store order can no longer be cancelled.';
  end if;

  update public.supplier_orders
     set status = 'cancelled', updated_at = now()
   where id = p_supplier_order_id;
end;
$$;

revoke all on function public.supplier_cancel_order(uuid) from public, anon;
grant execute on function public.supplier_cancel_order(uuid) to authenticated;

create or replace function public.customer_select_refund_account(
  p_refund_id uuid,
  p_refund_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refund_requests;
begin
  if auth.uid() is null then
    raise exception 'Sign in to select a refund account.' using errcode = '42501';
  end if;

  select * into v_refund
    from public.refund_requests
   where id = p_refund_id
   for update;

  if v_refund.id is null or v_refund.customer_id <> auth.uid() then
    raise exception 'That refund request was not found.' using errcode = '42501';
  end if;

  if v_refund.status <> 'awaiting_account' then
    raise exception 'A refund account can only be selected while the request is awaiting account details.';
  end if;

  if not exists (
    select 1 from public.refund_accounts
     where id = p_refund_account_id
       and customer_id = auth.uid()
  ) then
    raise exception 'Choose one of your saved refund accounts.' using errcode = '42501';
  end if;

  update public.refund_requests
     set refund_account_id = p_refund_account_id,
         status = 'pending',
         updated_at = now()
   where id = p_refund_id;
end;
$$;

revoke all on function public.customer_select_refund_account(uuid, uuid) from public, anon;
grant execute on function public.customer_select_refund_account(uuid, uuid) to authenticated;

create or replace function public.guard_refund_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.supplier_order_id is distinct from old.supplier_order_id
     or new.supplier_id is distinct from old.supplier_id
     or new.customer_id is distinct from old.customer_id
     or new.order_number is distinct from old.order_number
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at then
    raise exception 'Refund request details cannot be changed after creation.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'awaiting_account'
     and new.status = 'pending'
     and new.customer_id = auth.uid()
     and new.refund_account_id is not null
     and new.admin_note is not distinct from old.admin_note
     and new.processed_at is not distinct from old.processed_at
     and exists (
       select 1 from public.refund_accounts
        where id = new.refund_account_id
          and customer_id = auth.uid()
     ) then
    new.updated_at := now();
    return new;
  end if;

  if not public.is_admin() then
    raise exception 'Only MedLink administrators can update refund processing.' using errcode = '42501';
  end if;

  if new.refund_account_id is distinct from old.refund_account_id then
    raise exception 'The selected customer refund account cannot be changed by an administrator.' using errcode = '42501';
  end if;

  if old.status = 'awaiting_account' or old.status = 'refunded' then
    raise exception 'This refund request is not available for admin processing.' using errcode = '42501';
  end if;

  if not (
    (old.status = 'pending' and new.status in ('processing', 'refunded'))
    or (old.status = 'processing' and new.status = 'refunded')
  ) then
    raise exception 'Refunds must be processed in order: pending, processing, refunded.' using errcode = '42501';
  end if;

  if new.refund_account_id is null then
    raise exception 'A customer refund account must be selected before processing.' using errcode = '23514';
  end if;

  new.updated_at := now();
  if new.status = 'refunded' then
    new.processed_at := coalesce(new.processed_at, now());
  else
    new.processed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists refund_requests_guard_update on public.refund_requests;
create trigger refund_requests_guard_update
  before update on public.refund_requests
  for each row execute function public.guard_refund_request_update();

create or replace function public.notify_refund_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_message := case new.status
    when 'pending' then 'MedLink has received your refund account details and will process the refund.'
    when 'processing' then 'MedLink is processing your refund.'
    when 'refunded' then 'MedLink has marked your refund as paid.'
    else 'Your refund status has been updated.'
  end;

  insert into public.notifications (
    type, title, message, icon, customer_id, order_id, order_number
  ) values (
    'payment', 'Refund update for order ' || new.order_number, v_message,
    'wallet', new.customer_id, new.order_id, new.order_number
  );
  return new;
end;
$$;

drop trigger if exists refund_requests_notify_change on public.refund_requests;
create trigger refund_requests_notify_change
  after update of status on public.refund_requests
  for each row execute function public.notify_refund_request_change();

create or replace function public.admin_release_supplier_funds(target_supplier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier public.suppliers;
  v_payout public.payouts;
  v_so record;
  v_held numeric(12, 2);
  v_numbers text[] := '{}';
  v_order_ids uuid[] := '{}';
  v_fee numeric(12, 2);
  v_pricing public.pricing_config;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required to release escrow.' using errcode = '42501';
  end if;

  select * into v_supplier from public.suppliers where id = target_supplier;
  if v_supplier.id is null then
    raise exception 'Supplier % was not found.', target_supplier using errcode = 'P0002';
  end if;

  for v_so in
    select so.id, so.order_id, so.number,
      (
        select coalesce(sum(oi.price * oi.quantity), 0)
          from public.order_items oi
         where oi.order_id = so.order_id
           and oi.supplier_id = so.supplier_id
      ) as subtotal
      from public.supplier_orders so
      join public.orders o on o.id = so.order_id
      left join public.released_orders ro
        on ro.supplier_id = so.supplier_id and ro.order_id = so.order_id
     where so.supplier_id = target_supplier
       and so.status not in ('completed', 'cancelled')
       and o.status <> 'cancelled'
       and ro.order_id is null
  loop
    v_held := coalesce(v_held, 0) + v_so.subtotal;
    v_numbers := array_append(v_numbers, v_so.number);
    v_order_ids := array_append(v_order_ids, v_so.order_id);
  end loop;

  if coalesce(v_held, 0) <= 0 then
    return jsonb_build_object('released', false, 'reason', 'No held funds to release.');
  end if;

  select * into v_pricing from public.pricing_config where id;
  v_fee := round(v_held * v_pricing.service_fee_rate);

  insert into public.payouts (supplier_id, amount, service_fee, order_numbers, method, account_summary, released_by)
  values (
    target_supplier,
    v_held,
    v_fee,
    v_numbers,
    'Bank transfer',
    case
      when v_supplier.operating_account ->> 'accountNumber' is null then 'No payout account on file'
      else v_supplier.operating_account ->> 'bankName' || ' · **' ||
        right(v_supplier.operating_account ->> 'accountNumber', 4)
    end,
    auth.uid()
  )
  returning * into v_payout;

  insert into public.released_orders (supplier_id, order_id, payout_id)
  select target_supplier, unnest(v_order_ids), v_payout.id;

  return jsonb_build_object(
    'released', true,
    'payout_id', v_payout.id,
    'amount', v_payout.amount,
    'service_fee', v_payout.service_fee,
    'order_numbers', to_jsonb(v_numbers)
  );
end;
$$;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['refund_accounts', 'refund_requests'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
