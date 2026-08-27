-- transfer-kb-owner.sql - reassign a user-tier library to a new owner (TD-005).
--
-- RUN AS THE DATABASE OWNER, never as `karda_svc`. That is the whole point of
-- this file existing instead of an API route: `owner_sub` is column-locked in
-- `98_column_locks.sql`, and widening that lock would hand the runtime service
-- role a capability the governance design withholds on purpose (product
-- definition 4.6 - a departed user's library is transferred by the home
-- workspace admin, an administrative act).
--
-- It is NOT picked up by `apply.sh`: that applies the three baseline files and
-- `ddl/incr/*.sql` only, so nothing under `ops/` ever runs by itself. A transfer
-- that could be triggered by a routine db-init would be a very bad accident.
--
-- Usage (see docs/60-operations/50-run-transfer-kb-owner.md):
--
--   psql "$OWNER_DSN" -v ON_ERROR_STOP=1 \
--     -v kb_id='<uuid>' -v new_owner='<subject>' \
--     -f deploy/database/ops/transfer-kb-owner.sql
--
-- Values are passed through `set_config(..., true)` - transaction-local GUCs -
-- rather than interpolated into the DO block. psql does NOT substitute `:vars`
-- inside a dollar-quoted body, so `:'kb_id'` written in there would reach the
-- server as literal text and the script would fail in a confusing way.

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('karda.transfer_kb', :'kb_id', true);
SELECT set_config('karda.transfer_owner', :'new_owner', true);

-- BEFORE. Printed rather than merely checked: this line is the audit record of
-- what the library looked like going in, and the operator is expected to keep it.
SELECT id, name, owner_type, owner_sub AS owner_before, publish_state, updated_at
FROM karda_kb.knowledge_base
WHERE id = current_setting('karda.transfer_kb')::uuid;

DO $$
DECLARE
  v_kb    uuid := current_setting('karda.transfer_kb')::uuid;
  v_new   text := current_setting('karda.transfer_owner');
  v_row   karda_kb.knowledge_base%ROWTYPE;
BEGIN
  IF v_new IS NULL OR btrim(v_new) = '' THEN
    RAISE EXCEPTION 'new_owner is empty - refusing to orphan a library';
  END IF;

  SELECT * INTO v_row FROM karda_kb.knowledge_base WHERE id = v_kb;

  -- Every refusal below mirrors `canTransferOwnership` in
  -- portals/app/app/kb/lib/ownership.ts. The two are enforced in different
  -- places on purpose - the app decides whether the REQUESTER may ask, this
  -- decides whether the ROW may change - but they must not disagree about the
  -- shape, so they are stated in the same order and with the same words.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no library with id %', v_kb;
  END IF;

  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'library % is soft-deleted; restore it before transferring', v_kb;
  END IF;

  IF v_row.owner_type <> 'user' THEN
    RAISE EXCEPTION 'only user-tier libraries have a personal owner to transfer (this one is %)', v_row.owner_type;
  END IF;

  IF v_row.owner_sub = v_new THEN
    -- Not an error: re-running the same transfer must be safe. But it must also
    -- not report "transferred" when nothing moved.
    RAISE NOTICE 'library % is already owned by % - nothing to do', v_kb, v_new;
    RETURN;
  END IF;

  UPDATE karda_kb.knowledge_base
     SET owner_sub = v_new,
         updated_at = now()
   WHERE id = v_kb;

  RAISE NOTICE 'library % transferred from % to %', v_kb, v_row.owner_sub, v_new;
END $$;

-- AFTER. The second half of the audit record.
SELECT id, name, owner_type, owner_sub AS owner_after, publish_state, updated_at
FROM karda_kb.knowledge_base
WHERE id = current_setting('karda.transfer_kb')::uuid;

COMMIT;
