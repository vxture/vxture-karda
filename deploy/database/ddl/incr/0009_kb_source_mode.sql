-- 0009_kb_source_mode.sql - a library declares where its truth lives (owner 2026-08-30).
--
-- The AUTHORITATIVE definition lives in 00_baseline.sql; this file mirrors it so
-- a LIVE database adopts the change via db-init without a destructive reset.
--
-- Change, all on karda_kb.knowledge_base:
--   source_mode         new column, 'owned' | 'synced', default 'owned'
--   chk_kb_source_mode  the two-value CHECK
--   backfill            libraries with a live binding become 'synced'
--
-- WHY A LIBRARY NEEDS TO DECLARE THIS.
--
-- The rule in kb/lib/state.ts already says it: synced content is exempt from
-- governance "because the truth lives at the source; re-verifying it locally
-- would be theatre." So the product ALREADY knows that content pulled from a
-- connector and content we own are two different truth models.
--
-- What it did not have is a place for a LIBRARY to say which one it is. The
-- answer was inferred, per document, from `document.source` - which means the
-- question "can this library be trusted" had no answer, only N answers, one per
-- document. Three separate rules then had to remember the split independently:
--
--   · governance   truth at the source vs truth here (state.ts)
--   · deletion     a connector's delete signal covers only what it synced;
--                  `revokeCascade` tombstones only that binding's documents (I4)
--   · reconcile    a reconciliation sweep must not touch hand-uploaded files
--
-- A rule that has to be remembered in three places is a rule that will be
-- forgotten in one. `exempt_synced_content` was the patch over that; this column
-- is the thing it was patching.
--
-- WHY 'owned' IS THE DEFAULT AND WHY THE BACKFILL LOOKS LIKE THIS. A library
-- with no binding has never had an external truth, so `owned` is not a guess -
-- it is the only thing it can be. A library WITH a live binding is `synced`
-- because someone deliberately subscribed it to a source. Revoked bindings do
-- not count: a revoked binding means the subscription is over, and the content
-- left behind is now ours to keep or drop.
--
-- WHY THIS IS A DEFAULT, NOT A CONSTRAINT (owner 2026-08-30, option B). The mode
-- decides what the page looks like and which defaults apply; it does NOT forbid
-- a hand-upload into a synced library. That case is real - a regulation library
-- synced from upstream, plus a few locally written readings - and forbidding it
-- would push people into a second library, losing the fact that the two are one
-- thing.
--
-- The governance rule needs NO change for this to be correct: `governanceApplies`
-- already keys the exemption off the DOCUMENT's `synced`, so a local upload
-- inside a synced library is governed here, which is right - its truth IS here.
-- What was missing was never the rule; it was the declaration and its visibility.

ALTER TABLE karda_kb.knowledge_base
  ADD COLUMN IF NOT EXISTS source_mode VARCHAR(16) NOT NULL DEFAULT 'owned';

-- Guarded: re-running db-init must not fail on an already-present constraint,
-- and ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_kb_source_mode'
  ) THEN
    ALTER TABLE karda_kb.knowledge_base
      ADD CONSTRAINT chk_kb_source_mode CHECK (source_mode IN ('owned', 'synced'));
  END IF;
END $$;

-- Backfill, once. Guarded on the column having been all-default so a re-run does
-- not stomp a mode somebody has since set by hand: after the first apply the
-- rows that matter are no longer at the default, and this UPDATE matches nothing
-- it has not already matched.
UPDATE karda_kb.knowledge_base kb
   SET source_mode = 'synced'
 WHERE kb.source_mode = 'owned'
   AND EXISTS (
     SELECT 1 FROM karda_kb.binding b
      WHERE b.kb_id = kb.id AND b.state <> 'revoked'
   );

-- Column lock: source_mode is CHANGEABLE (a library can be switched between
-- modes), so it needs an UPDATE grant. 98_column_locks.sql carries the
-- authoritative grant; this line keeps a live database in step without waiting
-- for the next full 98 run.
GRANT UPDATE (source_mode) ON karda_kb.knowledge_base TO karda_svc;
