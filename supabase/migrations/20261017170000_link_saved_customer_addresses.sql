update public.addresses a
   set customer_id = p.id
  from public.profiles p
 where a.customer_id is null
   and lower(btrim(a.customer_email)) = lower(btrim(p.email));
