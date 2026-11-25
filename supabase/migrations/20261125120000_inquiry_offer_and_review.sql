-- Offers made from the CRM (line items as JSON) and review requests after an event.
alter table public.inquiries
  add column if not exists offer jsonb,
  add column if not exists offer_sent_at timestamptz,
  add column if not exists review_requested_at timestamptz;
alter table public.app_settings
  add column if not exists google_review_url text;
