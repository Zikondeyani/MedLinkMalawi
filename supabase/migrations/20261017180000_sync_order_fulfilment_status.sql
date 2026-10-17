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
  if new.status is not distinct from old.status or public.is_admin() then
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
  before update of status on public.supplier_orders
  for each row execute function public.guard_supplier_order_status_change();

create or replace function public.notify_new_supplier_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    type, title, message, icon, supplier_id, order_id, order_number
  ) values (
    'order',
    'New order ' || new.number,
    'A customer order is waiting for your store to confirm.',
    'package',
    new.supplier_id,
    new.order_id,
    new.number
  );
  return new;
end;
$$;

drop trigger if exists supplier_orders_notify_new_order on public.supplier_orders;
create trigger supplier_orders_notify_new_order
  after insert on public.supplier_orders
  for each row execute function public.notify_new_supplier_order();

create or replace function public.notify_new_marketplace_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    type, title, message, icon, order_id, order_number
  ) values (
    'order',
    'New pending order ' || new.number,
    'A customer placed an order. Stores are waiting to confirm fulfilment.',
    'package',
    new.id,
    new.number
  );
  return new;
end;
$$;

drop trigger if exists orders_notify_new_order on public.orders;
create trigger orders_notify_new_order
  after insert on public.orders
  for each row execute function public.notify_new_marketplace_order();

create or replace function public.sync_order_status_from_supplier_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_next_status public.customer_order_status;
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
    bool_and(status <> 'new'),
    bool_or(status = 'preparing'),
    bool_and(status in ('ready', 'completed'))
    into v_all_accepted, v_any_preparing, v_all_ready
    from public.supplier_orders
   where order_id = new.order_id;

  v_next_status := case
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
             'note', 'Status synchronized from store fulfilment'
           )),
           updated_at = v_changed_at
     where id = new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_orders_sync_customer_order_status on public.supplier_orders;
create trigger supplier_orders_sync_customer_order_status
  after update of status on public.supplier_orders
  for each row execute function public.sync_order_status_from_supplier_orders();

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
    v_type,
    'Order ' || new.number || ' ' || v_label,
    'Your order status is now ' || v_label || '.',
    v_icon,
    new.customer_id,
    new.customer_email,
    new.id,
    new.number
  );

  insert into public.notifications (
    type, title, message, icon, order_id, order_number
  ) values (
    v_type,
    'Order ' || new.number || ' ' || v_label,
    'The order status is now ' || v_label || '.',
    v_icon,
    new.id,
    new.number
  );

  if new.status in ('out_for_delivery', 'delivered') then
    insert into public.notifications (
      type, title, message, icon, supplier_id, order_id, order_number
    )
    select
      v_type,
      'Order ' || new.number || ' ' || v_label,
      'MedLink updated delivery status to ' || v_label || '.',
      v_icon,
      oi.supplier_id,
      new.id,
      new.number
    from (
      select distinct supplier_id
        from public.order_items
       where order_id = new.id
    ) oi;
  end if;

  if new.status = 'delivered' then
    update public.supplier_orders
       set status = 'completed',
           updated_at = now()
     where order_id = new.id
       and status <> 'completed';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_notify_status_change on public.orders;
create trigger orders_notify_status_change
  after update of status on public.orders
  for each row execute function public.notify_customer_order_status_change();

create or replace function public.customer_confirm_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_confirmed_at timestamptz := now();
  v_timeline jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to confirm delivery.' using errcode = '42501';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null or v_order.customer_id <> auth.uid() then
    raise exception 'That order was not found.' using errcode = '42501';
  end if;

  if v_order.status <> 'out_for_delivery' then
    raise exception 'Delivery can only be confirmed when the order is out for delivery.';
  end if;

  v_timeline := case
    when jsonb_typeof(v_order.timeline) = 'array' then v_order.timeline
    else '[]'::jsonb
  end;

  update public.orders
     set status = 'delivered',
         timeline = v_timeline || jsonb_build_array(jsonb_build_object(
           'status', 'delivered',
           'at', v_confirmed_at,
           'note', 'Delivery confirmed by the customer'
         )),
         updated_at = v_confirmed_at
   where id = p_order_id;
end;
$$;

revoke all on function public.customer_confirm_delivery(uuid) from public, anon;
grant execute on function public.customer_confirm_delivery(uuid) to authenticated;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['orders', 'supplier_orders', 'notifications'] loop
      if not exists (
        select 1
          from pg_publication_tables
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
