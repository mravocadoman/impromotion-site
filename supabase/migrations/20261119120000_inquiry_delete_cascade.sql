-- Deleting an inquiry from the CRM also removes the bookings it created, so the actors' days free up.
alter table public.bookings drop constraint bookings_inquiry_id_fkey;
alter table public.bookings add constraint bookings_inquiry_id_fkey
  foreign key (inquiry_id) references public.inquiries (id) on delete cascade;
