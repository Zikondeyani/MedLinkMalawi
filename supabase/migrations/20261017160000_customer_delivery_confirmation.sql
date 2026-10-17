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

  update public.supplier_orders
     set status = 'completed',
         updated_at = v_confirmed_at
   where order_id = p_order_id
     and status <> 'completed';

  insert into public.notifications (
    type, title, message, icon, customer_id, customer_email, order_id, order_number
  ) values (
    'delivery',
    'Delivery confirmed for order ' || v_order.number,
    'The customer confirmed that the order was received.',
    'truck',
    v_order.customer_id,
    v_order.customer_email,
    v_order.id,
    v_order.number
  );

  insert into public.notifications (
    type, title, message, icon, order_id, order_number
  ) values (
    'delivery',
    'Order ' || v_order.number || ' delivered',
    'The customer confirmed receipt of the order.',
    'truck',
    v_order.id,
    v_order.number
  );

  insert into public.notifications (
    type, title, message, icon, supplier_id, order_id, order_number
  )
  select
    'delivery',
    'Order ' || v_order.number || ' delivered',
    'The customer confirmed receipt of the order.',
    'truck',
    oi.supplier_id,
    v_order.id,
    v_order.number
  from (
    select distinct supplier_id
      from public.order_items
     where order_id = p_order_id
  ) oi;
end;
$$;

revoke all on function public.customer_confirm_delivery(uuid) from public, anon;
grant execute on function public.customer_confirm_delivery(uuid) to authenticated;
