# ADR-002 - the vector index store is Postgres (JSONB + in-process similarity)

- Status: accepted
- Date: 2026-08-18
- Context batch: 5b/6b (TD-004 closure - Atlas /v1 shipped A1 embedding + A3
  rerank)

## Context

`chunk.vector_ref` has always been documented as "a pointer to the index store,
which does not exist yet" (00_baseline: "The vector lives in the index store,
not here"). With Atlas A1 live, the store must exist. Three candidates:

1. **pgvector** in the business DB - the standard answer, but the stack runs the
   stock `postgres:18-alpine` image, which does not ship the extension. Adopting
   it means changing the database image (a deploy/compose change on a live prod
   stack) or building a custom image - infrastructure cost before the first
   vector is ever stored.
2. **A separate vector service** (qdrant/milvus/...) - a new container, new
   backup story, new failure mode, and a second store to keep transactionally
   consistent with the atomic-replace chunk commit. Far too heavy for v1 scale.
3. **Plain Postgres**: a `karda_kb.chunk_embedding` table (vector as a JSONB
   float array), similarity computed in-process at recall time.

## Decision

Option 3. One row per embedded chunk (`chunk_id` PK/FK, `model_code`, `dim`,
`vector JSONB`), written in the SAME transaction as the chunk-version commit, so
atomic-replace covers vectors for free and deletes ride the chunk FK cascade.
Recall loads the whitelisted libraries' active-version vectors and ranks by
cosine in-process behind the `VectorCorpus` port.

`model_code` on every row is the KD-107 vector-space lock: recall only compares
vectors whose model matches the query's embedding model. `chunk.vector_ref` is
set to `db:<model_code>` at insert (chunk columns are not UPDATE-writable), so
"this chunk has a vector, in this space" is readable without a join.

## Consequences

- **Scale ceiling, accepted**: in-process cosine is O(chunks-in-scope) per
  query. At v1 scale (a workspace's attached libraries, thousands to tens of
  thousands of chunks) this is milliseconds; it degrades linearly. The named
  scale path is pgvector (option 1) behind the SAME `VectorCorpus` port - the
  port returns ranked candidates either way, so the swap is an implementation
  change plus a db-image change, not a redesign.
- **No second consistency domain**: vectors can never disagree with chunks about
  which version is active, because they commit and cascade together.
- **Entries are not vectorized in v1**: an Entry is its own recall unit and
  stays BM25-recalled; RRF fuses the paths, so entries still surface. Entry
  vectorization is a later increment on the same table shape.
- **Structure change ships via db-init only**: `incr/0003_chunk_embedding.sql`
  (grants travel with the increment, the TD-010 pattern); the live DB gains the
  table on the next gated `db-init apply`.
