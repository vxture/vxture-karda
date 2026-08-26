-- 0007_chunk_source_range.sql - where a chunk came from (140-assertion-model, batch 15).
--
-- The AUTHORITATIVE definition lives in 00_baseline.sql; this file mirrors it so
-- a LIVE database adopts the columns via db-init without a destructive reset.
--
-- Change: two nullable columns on karda_kb.chunk -
--   start_offset / end_offset   the half-open range of the document's CANONICAL
--                               text this chunk was built from
--
-- Why: the assertion layer anchors every span to `(document, version, offsets)`.
-- A citation, however, is a CHUNK id - and nothing connected the two. Without a
-- shared offset space the only honest answer to "which assertions does this
-- citation rest on" is document-level, and telling an agent "here are 400
-- assertions from this 200-page manual" answers nothing it asked. With it the
-- question is a range intersection.
--
-- The canonical text is the stored bytes with line endings normalised and
-- nothing else (`kb/processing/ir.ts` `canonicalText`), so it is reproducible
-- from the object store at any time. Anything more aggressive would make the
-- offsets depend on a transformation nobody recorded.
--
-- NULLABLE, and staying that way: chunks written before this increment have no
-- offsets and cannot get them without a reparse. A NOT NULL with a backfilled
-- zero would be worse than absent - it would claim every old chunk starts at
-- the top of its document. Readers treat NULL as "unknown", not as "0".
--
-- No column-lock change: `chunk` already has UPDATE revoked entirely (97/98) -
-- a chunk is written once per version and replaced wholesale by the atomic
-- swap, so these columns inherit that.
--
-- Idempotent: safe to re-run.

ALTER TABLE karda_kb.chunk
  ADD COLUMN IF NOT EXISTS start_offset INTEGER,
  ADD COLUMN IF NOT EXISTS end_offset   INTEGER;

-- Both or neither, and ordered. A half-populated pair would be a range that
-- cannot be intersected, which is worse than no range at all.
--
-- DROP then ADD rather than `IF NOT EXISTS`: a constraint whose DEFINITION
-- changed would be silently kept by an existence check, which is how a fixed
-- rule fails to reach the database that needed fixing.
ALTER TABLE karda_kb.chunk DROP CONSTRAINT IF EXISTS chk_chunk_source_range;
ALTER TABLE karda_kb.chunk
  ADD CONSTRAINT chk_chunk_source_range CHECK (
        -- Three-valued logic, deliberately explicit. The obvious form -
        --   (a IS NULL AND b IS NULL) OR (a >= 0 AND b > a)
        -- does NOT do what it reads as: with a = 10 and b = NULL the second
        -- branch evaluates to NULL, `FALSE OR NULL` is NULL, and a CHECK
        -- constraint PASSES on NULL. A live probe caught exactly that - half a
        -- range was accepted by a constraint whose comment said "both or
        -- neither". `(a IS NULL) = (b IS NULL)` is never NULL, so it decides.
        (start_offset IS NULL) = (end_offset IS NULL)
        AND (start_offset IS NULL OR (start_offset >= 0 AND end_offset > start_offset))
      );

-- The lookup `get_evidence` makes: given a document version, find the chunks
-- (and then, by intersection, the spans) covering a range.
CREATE INDEX IF NOT EXISTS idx_chunk_source_range
  ON karda_kb.chunk (document_id, version, start_offset);
