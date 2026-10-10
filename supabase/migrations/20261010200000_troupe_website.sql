-- Troupes get a website / Facebook page link (the admin troupe form already sends it). https only.
alter table public.troupes add column if not exists website text
  check (website is null or website ~ '^https://[^ <>"]+$');
