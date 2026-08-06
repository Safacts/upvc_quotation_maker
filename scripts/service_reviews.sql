create table if not exists service_reviews (
  id bigint generated always as identity primary key,
  client_id text not null default 'venkateshwara',
  customer_name text not null,
  role text,
  rating int not null check (rating between 1 and 5),
  review_text text not null,
  is_visible boolean not null default true,
  source text not null default 'market',
  created_at timestamptz not null default now(),
  quotation_no text
);

create index if not exists service_reviews_client_created_idx
  on service_reviews (client_id, is_visible, created_at desc);

create unique index if not exists service_reviews_client_quote_uidx
  on service_reviews (client_id, quotation_no)
  where quotation_no is not null;

alter table service_reviews enable row level security;

drop policy if exists service_reviews_select_public on service_reviews;
create policy service_reviews_select_public on service_reviews
  for select to anon, authenticated
  using (is_visible = true);

drop policy if exists service_reviews_insert_public on service_reviews;
create policy service_reviews_insert_public on service_reviews
  for insert to anon, authenticated
  with check (
    rating between 1 and 5
    and char_length(customer_name) between 1 and 100
    and char_length(review_text) between 1 and 1000
  );

do $$
begin
  if not exists (select 1 from service_reviews where client_id = 'kprupvc') then
    insert into service_reviews (client_id, customer_name, role, rating, review_text, source) values
      ('kprupvc', 'Rajesh Kumar', 'Architect, Hyderabad', 5,
       'KPR Windows transformed our luxury villa project. Their structural glazing is flawless, and the attention to detail during installation was exceptional.', 'seed'),
      ('kprupvc', 'Srinivas Reddy', 'Homeowner', 5,
       'The noise insulation of their UPVC profiles is unbelievable. Our home on the busy Sagar Road is now completely silent. Worth every penny.', 'seed'),
      ('kprupvc', 'Priya Sharma', 'Interior Designer', 5,
       'I always recommend KPR to my premium clients. Their glass partitions and sliding doors add that perfect modern, minimal touch to any space.', 'seed'),
      ('kprupvc', 'Vikram Singh', 'Commercial Developer', 5,
       'Delivered our office facade on time and with incredible precision. The ACP cladding and spider glazing gave the building a world-class look.', 'seed');
  end if;
end $$;
