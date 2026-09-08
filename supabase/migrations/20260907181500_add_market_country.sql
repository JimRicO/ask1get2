-- Market country decides what is buyable, not what the wine's origin is.
-- Seeded silently from the browser locale, editable from the pairing screen.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS market_country TEXT;

-- price_per_bottle has never had a currency. Anyone who has bought bottles in
-- more than one country already has mixed numbers in this column, and the
-- pairing price band makes that visible.
ALTER TABLE public.wines
  ADD COLUMN IF NOT EXISTS price_currency TEXT;
