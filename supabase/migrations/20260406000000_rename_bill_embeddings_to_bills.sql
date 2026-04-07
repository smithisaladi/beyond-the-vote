-- Rename bill_embeddings → bills.
--
-- The table was originally named bill_embeddings when it stored OpenAI
-- vector embeddings. The embedding column was dropped in migration
-- 20260405000004; the name became a misnomer. This migration corrects it.
--
-- BACKWARD COMPATIBILITY
--   A view named bill_embeddings is created so that all existing RPC
--   function bodies (hybrid_bill_search, get_bills_by_topic, etc.) that
--   query FROM public.bill_embeddings continue to work without modification.
--
--   The one exception is lookup_bill, whose return type was bound to the
--   composite type public.bill_embeddings via RETURNS SETOF. Renaming the
--   table renames the composite type to public.bills, so the function must
--   be dropped and recreated.

-- 1. Rename the table (also renames the composite row type).
ALTER TABLE public.bill_embeddings RENAME TO bills;

-- 2. Recreate lookup_bill with the updated return type.
DROP FUNCTION IF EXISTS public.lookup_bill(TEXT);

CREATE FUNCTION public.lookup_bill(query_text TEXT)
RETURNS SETOF public.bills LANGUAGE sql STABLE AS $$
  SELECT * FROM public.bills
  WHERE  bill_id     = lower(trim(query_text))
     OR  upper(bill_number) = upper(trim(query_text))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_bill TO anon, authenticated;

-- 3. Create the backward-compatible view so existing RPC bodies that
--    reference FROM public.bill_embeddings continue to resolve.
CREATE VIEW public.bill_embeddings AS SELECT * FROM public.bills;

GRANT SELECT ON public.bill_embeddings TO anon, authenticated;
