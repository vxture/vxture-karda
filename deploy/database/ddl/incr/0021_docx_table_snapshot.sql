BEGIN;
-- Replace only the format/version CHECK, retaining immutable rows and grants.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='karda_kb.document_text_snapshot'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%parser_version%'
      AND pg_get_constraintdef(oid) LIKE '%mime%'
  LOOP
    EXECUTE format('ALTER TABLE karda_kb.document_text_snapshot DROP CONSTRAINT %I',constraint_name);
  END LOOP;
END $$;
ALTER TABLE karda_kb.document_text_snapshot
  ADD CONSTRAINT document_text_snapshot_parser_check CHECK (
    (mime='application/pdf' AND parser_version='pypdf-6.21.4-v1') OR
    (mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      AND parser_version IN ('docx-main-body-v1','docx-body-tables-v2')));
COMMIT;
