import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { permits, type ProductPermission } from "../../authz/policy";
import { readProductAccess, type RoleSql } from "../../authz/store";
import type { ObjectStore } from "../storage/objectstore";
import { preparePublication, type PublicationCommand, type PublicationReceipt } from "./publication";
import { decodeSemanticRelease, semanticDefinitionKey, type SemanticReleasePayload } from "./release-format";
import type { PublishedRelationInput, SemanticReadIdentity } from "./read-postgres";
import { matchesSourceSpan, verifiedSourceText, MAX_SEMANTIC_SOURCE_BYTES } from "./source-text";
import { projectNeighborhood } from "./projection";
import type { KnowledgeSnapshot } from "./contracts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ZERO = "00000000-0000-0000-0000-000000000000";
/** Bounded canonical hash; the fixed envelope is only a hash domain separator. */
export function semanticValueHash(payload: unknown): string {
  return preparePublication({ kbId: ZERO, eventId: ZERO, expectedGeneration: 0,
    sourceRevision: "value-v1", reviewRevision: "value-v1", schemaRevision: "value-v1", payload }).fingerprint;
}
function decode(kbId: string, payload: unknown): PublishedRelationInput {
  return decodeSemanticRelease({ kbId, eventId: ZERO, expectedGeneration: 0,
    sourceRevision: "decode", reviewRevision: "decode", schemaRevision: "decode", payload });
}
function frozenPayload(kbId: string, payload: SemanticReleasePayload): SemanticReleasePayload {
  const input = decode(kbId, payload);
  return { format: payload.format, schema: input.schema, entityTypes: [...input.entityTypes].map(([kind, type]) => ({ kind, type })),
    relations: input.relations, sources: input.sources };
}
function subjectHash(input: PublishedRelationInput, relationId: string): string {
  return semanticValueHash({ definition: semanticDefinitionKey(input), sources: input.sources,
    relation: input.relations.find(row => row.id === relationId) });
}
interface CompileRow { id: string; kb_id: string; schema_version_id: string; candidates: SemanticReleasePayload; source_manifest: unknown;
  input_hash: string; config_hash: string; status: string }
interface ReviewRow { id: string; subject_key: string; subject_hash: string; revision: number; decision: string }
async function compiled(db: PoolClient, kbId: string, runId: string): Promise<{ row: CompileRow; input: PublishedRelationInput }> {
  const row = (await db.query<CompileRow>(`SELECT id,kb_id,schema_version_id,candidates,source_manifest,input_hash,config_hash,status
    FROM karda_kb.semantic_compile_run WHERE kb_id=$1 AND id=$2`, [kbId, runId])).rows[0];
  if (!row || row.status !== "validated") throw new Error("semantic_compile_unavailable");
  const input = decode(kbId, row.candidates);
  if (semanticValueHash(input.sources) !== row.input_hash || semanticValueHash(row.source_manifest) !== row.input_hash)
    throw new Error("semantic_corrupt_compile");
  return { row, input };
}
async function latestReviews(db: PoolClient, kbId: string, input: PublishedRelationInput): Promise<ReviewRow[]> {
  return (await db.query<ReviewRow>(`SELECT DISTINCT ON (subject_key) id,subject_key,subject_hash,revision,decision
    FROM karda_kb.semantic_review WHERE kb_id=$1 AND subject_key=ANY($2::text[])
    ORDER BY subject_key,revision DESC`, [kbId, input.relations.map(row => `relation/${row.id}`)])).rows;
}
function acceptedReviews(input: PublishedRelationInput, reviews: ReviewRow[]): void {
  if (reviews.length !== input.relations.length || input.relations.some(relation => {
    const review = reviews.find(row => row.subject_key === `relation/${relation.id}`);
    return !review || review.decision !== "accept" || review.subject_hash !== subjectHash(input, relation.id);
  })) throw new Error("semantic_review_required");
}

/** Formal-table writer. Native-text, same-workspace user-owned libraries only.
 * Identity and platform admission MUST come from verified server context.
 * No environment factory, public route, offline receipt import or auto-approval.
 */
export class PostgresSemanticStore {
  constructor(private readonly pool: Pool, private readonly objects: Pick<ObjectStore, "get">,
    private readonly admitPlatform: (identity: SemanticReadIdentity) => Promise<boolean>) {}

  private async write<T>(identity: SemanticReadIdentity, kbId: string, permission: ProductPermission,
    work: (db: PoolClient) => Promise<T>): Promise<T> {
    identity = { ...identity, roles: [...identity.roles] };
    if (!UUID.test(kbId) || !UUID.test(identity.workspaceId) ||
      !/^usr_[a-f0-9-]{36}$/i.test(identity.sub) || !/^[a-z][a-z0-9_-]{0,31}$/.test(identity.productCode))
      throw new Error("semantic_invalid_scope");
    if (await this.admitPlatform(identity) !== true) throw new Error("semantic_write_denied");
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      // Same lock as the product role editor, then one lock for all semantic
      // writes in this library (including review inserts and first publication).
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`karda:roles:${identity.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`karda:semantic:${kbId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE", [identity.workspaceId, identity.sub]);
      const sql: RoleSql = {
        $queryRawUnsafe: async <R>(statement: string, ...values: unknown[]) => (await db.query(statement, values)).rows as R,
        $executeRawUnsafe: async () => { throw new Error("semantic_role_read_only"); },
      };
      const access = await readProductAccess(identity, sql);
      if (!permits(access, "product.enter") || !permits(access, permission)) throw new Error("semantic_write_denied");
      const library = await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2
        AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL FOR SHARE`, [kbId, identity.workspaceId, identity.sub]);
      if (library.rowCount !== 1) throw new Error("semantic_write_denied");
      const result = await work(db);
      await db.query("COMMIT"); return result;
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }

  /** Validates current physical inputs; hashes and offsets use the same bytes. */
  private async sources(db: PoolClient, input: PublishedRelationInput): Promise<Map<string, string>> {
    if (input.sources.length > 100) throw new Error("semantic_source_budget");
    const texts = new Map<string, string>(); let budget = 32 * 1024 * 1024;
    for (const source of [...input.sources].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
      const row = (await db.query<{active_chunk_version: number; content_state: string; content_hash: string;
        mime: string; storage_ref: string; size_bytes: string}>(`SELECT active_chunk_version,content_state,content_hash,mime,storage_ref,size_bytes
        FROM karda_kb.document WHERE kb_id=$1 AND id=$2 FOR SHARE`, [source.kbId, source.documentId])).rows[0];
      const size = Number(row?.size_bytes);
      if (!row || row.active_chunk_version !== source.version || row.content_hash !== source.contentHash ||
        row.content_state !== "indexed" || !row.storage_ref || !Number.isSafeInteger(size) || size < 0 || size > MAX_SEMANTIC_SOURCE_BYTES)
        throw new Error("semantic_source_changed");
      if (size > budget) throw new Error("semantic_source_budget"); budget -= size;
      const bytes = await this.objects.get(row.storage_ref);
      const text = verifiedSourceText({ activeVersion: row.active_chunk_version, contentState: row.content_state,
        mime: row.mime, contentHash: row.content_hash }, bytes?.length === size ? bytes : null);
      if (text === null) throw new Error("semantic_source_changed");
      texts.set(source.documentId, text);
    }
    return texts;
  }

  /** A validated compile is still a candidate snapshot, never a publication. */
  async recordCompile(identity: SemanticReadIdentity, kbId: string, input: {
    taskKey: string; configHash: string; payload: SemanticReleasePayload;
  }): Promise<{ runId: string; duplicate: boolean }> {
    if (!HASH.test(input.taskKey) || !HASH.test(input.configHash)) throw new Error("semantic_invalid_compile");
    const actor = identity.sub;
    const taskKey = input.taskKey, configHash = input.configHash, payload = frozenPayload(kbId, input.payload), decoded = decode(kbId, payload);
    const definition = { schema: payload.schema, entityTypes: payload.entityTypes };
    const definitionHash = semanticValueHash(definition), inputHash = semanticValueHash(decoded.sources);
    return this.write(identity, kbId, "data.write", async db => {
      await this.sources(db, decoded);
      await db.query(`INSERT INTO karda_kb.semantic_schema_version(kb_id,namespace,schema_id,version,definition_hash,definition)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kb_id,namespace,schema_id,version) DO NOTHING`,
        [kbId, decoded.schema.namespace, decoded.schema.schemaId, decoded.schema.version, definitionHash, definition]);
      const schema = (await db.query<{id: string; definition_hash: string; definition: unknown}>(`SELECT id,definition_hash,definition
        FROM karda_kb.semantic_schema_version WHERE kb_id=$1 AND namespace=$2 AND schema_id=$3 AND version=$4`,
        [kbId, decoded.schema.namespace, decoded.schema.schemaId, decoded.schema.version])).rows[0];
      if (schema.definition_hash !== definitionHash || semanticValueHash(schema.definition) !== definitionHash)
        throw new Error("semantic_schema_version_conflict");
      const previous = (await db.query<{id: string; candidates: unknown; config_hash: string}>(`SELECT id,candidates,config_hash
        FROM karda_kb.semantic_compile_run WHERE kb_id=$1 AND task_key=$2`, [kbId, taskKey])).rows[0];
      if (previous) {
        if (semanticValueHash(previous.candidates) !== semanticValueHash(payload) || previous.config_hash !== configHash)
          throw new Error("semantic_compile_task_conflict");
        return { runId: previous.id, duplicate: true };
      }
      const runId = randomUUID();
      await db.query(`INSERT INTO karda_kb.semantic_compile_run(id,kb_id,schema_version_id,task_key,input_hash,config_hash,
        source_manifest,candidates,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'validated',$9)`,
        [runId, kbId, schema.id, taskKey, inputHash, configHash, JSON.stringify(decoded.sources), payload, actor]);
      return { runId, duplicate: false };
    });
  }

  async reviewRelation(identity: SemanticReadIdentity, kbId: string, request: {
    runId: string; relationId: string; expectedRevision: number; decision: "accept" | "revise" | "reject"; note: string;
  }): Promise<{ reviewId: string; revision: number }> {
    const input = { ...request }, actor = identity.sub;
    if (!UUID.test(input.runId) || !UUID.test(input.relationId) || !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 || input.expectedRevision >= 2147483647 || !["accept", "revise", "reject"].includes(input.decision) ||
      typeof input.note !== "string" || !input.note.trim() || [...input.note].length > 10000) throw new Error("semantic_invalid_review");
    return this.write(identity, kbId, "service.publish", async db => {
      const compiledInput = (await compiled(db, kbId, input.runId)).input;
      if (!compiledInput.relations.some(row => row.id === input.relationId)) throw new Error("semantic_relation_missing");
      const subjectKey = `relation/${input.relationId}`;
      const previous = (await latestReviews(db, kbId, compiledInput)).find(row => row.subject_key === subjectKey);
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error("semantic_review_stale_revision");
      const reviewId = randomUUID(), revision = input.expectedRevision + 1;
      await db.query(`INSERT INTO karda_kb.semantic_review(id,kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [reviewId, kbId, subjectKey, revision, input.decision,
        subjectHash(compiledInput, input.relationId), actor, input.note.trim()]);
      return { reviewId, revision };
    });
  }

  /** Captures a publish plan. Later writes cannot silently change this command. */
  async plan(identity: SemanticReadIdentity, kbId: string, runId: string, eventId: string, expectedGeneration: number): Promise<PublicationCommand> {
    if (!UUID.test(runId)) throw new Error("semantic_invalid_compile");
    return this.write(identity, kbId, "service.publish", async db => {
      const { row, input } = await compiled(db, kbId, runId);
      const reviews = await latestReviews(db, kbId, input); acceptedReviews(input, reviews);
      return preparePublication({ kbId, eventId, expectedGeneration, sourceRevision: row.input_hash,
        schemaRevision: semanticValueHash({ schema: input.schema, entityTypes: row.candidates.entityTypes }),
        reviewRevision: semanticValueHash(reviews), payload: { ...row.candidates, compileRunId: runId } }).command;
    });
  }

  async publish(identity: SemanticReadIdentity, request: PublicationCommand): Promise<PublicationReceipt> {
    const { command, fingerprint } = preparePublication(request), input = decodeSemanticRelease(command), actor = identity.sub;
    const runId = (command.payload as {compileRunId?: string}).compileRunId;
    if (typeof runId !== "string" || !UUID.test(runId)) throw new Error("semantic_invalid_compile");
    return this.write(identity, command.kbId, "service.publish", async db => {
      const previous = (await db.query<{fingerprint: string; release_id: string; generation: number}>(`SELECT fingerprint,release_id,generation
        FROM karda_kb.semantic_event_receipt WHERE kb_id=$1 AND event_id=$2`, [command.kbId, command.eventId])).rows[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("publication_event_conflict");
        return { releaseId: previous.release_id, generation: previous.generation, duplicate: true };
      }
      const head = (await db.query<{generation: number}>("SELECT generation FROM karda_kb.semantic_release_head WHERE kb_id=$1 FOR UPDATE", [command.kbId])).rows[0];
      if ((head?.generation ?? 0) !== command.expectedGeneration) throw new Error("publication_stale_generation");
      const { row } = await compiled(db, command.kbId, runId);
      if (semanticValueHash(command.payload) !== semanticValueHash({ ...row.candidates, compileRunId: runId }))
        throw new Error("semantic_compile_payload_mismatch");
      const reviews = await latestReviews(db, command.kbId, input); acceptedReviews(input, reviews);
      if (row.input_hash !== command.sourceRevision || semanticValueHash(reviews) !== command.reviewRevision ||
        semanticValueHash({ schema: input.schema, entityTypes: row.candidates.entityTypes }) !== command.schemaRevision)
        throw new Error("publication_authority_changed");
      const texts = await this.sources(db, input);
      await validateGrounds(db, input, texts);
      const releaseId = randomUUID(), generation = command.expectedGeneration + 1;
      await db.query(`INSERT INTO karda_kb.semantic_release(id,kb_id,generation,schema_version_id,compile_run_id,fingerprint,payload,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [releaseId, command.kbId, generation, row.schema_version_id, runId, fingerprint, command, actor]);
      for (const relation of input.relations) {
        await db.query(`INSERT INTO karda_kb.semantic_relation(kb_id,release_id,relation_id,type,source_id,target_id)
          VALUES($1,$2,$3,$4,$5,$6)`, [command.kbId, releaseId, relation.id, relation.type, relation.sourceId, relation.targetId]);
        for (const assertionId of relation.assertionIds) await db.query(`INSERT INTO karda_kb.semantic_relation_assertion(kb_id,release_id,relation_id,assertion_id)
          VALUES($1,$2,$3,$4)`, [command.kbId, releaseId, relation.id, assertionId]);
      }
      for (const source of input.sources) await db.query(`INSERT INTO karda_kb.semantic_release_source(kb_id,release_id,document_id,document_version,content_hash)
        VALUES($1,$2,$3,$4,$5)`, [command.kbId, releaseId, source.documentId, source.version, source.contentHash]);
      for (const review of reviews) await db.query("INSERT INTO karda_kb.semantic_release_review(kb_id,release_id,review_id) VALUES($1,$2,$3)", [command.kbId, releaseId, review.id]);
      const switched = await db.query(`INSERT INTO karda_kb.semantic_release_head(kb_id,generation,release_id) VALUES($1,$2,$3)
        ON CONFLICT(kb_id) DO UPDATE SET generation=EXCLUDED.generation,release_id=EXCLUDED.release_id,updated_at=now()
        WHERE semantic_release_head.generation=$4 RETURNING generation`, [command.kbId, generation, releaseId, command.expectedGeneration]);
      if (switched.rowCount !== 1) throw new Error("publication_stale_generation");
      await db.query(`INSERT INTO karda_kb.semantic_event_receipt(kb_id,event_id,fingerprint,release_id,generation) VALUES($1,$2,$3,$4,$5)`,
        [command.kbId, command.eventId, fingerprint, releaseId, generation]);
      return { releaseId, generation, duplicate: false };
    });
  }
}

/** Check every asserted edge against live same-library entities and support. */
async function validateGrounds(db: PoolClient, input: PublishedRelationInput, texts: Map<string, string>): Promise<void> {
  if (!input.relations.length) return;
  const kb = input.relations[0].kbId;
  const ids = [...new Set(input.relations.flatMap(row => [row.sourceId, row.targetId]))];
  const supports = [...new Set(input.relations.flatMap(row => row.assertionIds))];
  if (ids.length > 5000 || supports.length > 5000 || input.relations.reduce((n,r) => n + r.assertionIds.length, 0) > 5000)
    throw new Error("semantic_snapshot_limit");
  // Evidence/span have no UPDATE grant, so tuple locks would require weakening
  // their immutable-column policy. Their existing DELETE grant permits SHARE
  // table locks instead. This conservative publication lock blocks concurrent
  // support removal/insertion until commit; readers remain nonblocking.
  await db.query("LOCK TABLE karda_kb.evidence,karda_kb.span IN SHARE MODE");
  const entities = (await db.query<{id: string; kind: string; name: string}>(`SELECT id,kind,name FROM karda_kb.entity
    WHERE kb_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`, [kb, ids])).rows;
  const assertions = (await db.query<{id: string; content_state: string; verification_state: string;
    expires_at: Date | null; valid_until: Date | null; superseded_by: string | null}>(`SELECT id,content_state,verification_state,expires_at,valid_until,superseded_by
    FROM karda_kb.assertion WHERE kb_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`, [kb, supports])).rows;
  const grounds = (await db.query<{id: string; assertion_id: string; document_id: string; document_version: number;
    start_offset: number; end_offset: number; excerpt: string}>(`SELECT e.id,e.assertion_id,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt
    FROM karda_kb.evidence e JOIN karda_kb.span s ON s.id=e.span_id
    WHERE e.assertion_id=ANY($1::uuid[]) AND e.stance='supports' AND e.supports_id IS NULL
    ORDER BY e.id LIMIT 5001`, [supports])).rows;
  if (grounds.length > 5000) throw new Error("semantic_snapshot_limit");
  const now = (await db.query<{now: Date}>("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
  const snapshot: KnowledgeSnapshot = { entities: entities.flatMap(row => {
    const type = input.entityTypes.get(row.kind); return type ? [{id: row.id, kbId: kb, type, label: row.name}] : [];
  }), relations: input.relations, sources: input.sources.map(row => ({ ...row, current: true, withdrawn: false,
    textLength: texts.get(row.documentId)!.length })), evidence: [], assertions: [] };
  for (const evidence of grounds) {
    const source = input.sources.find(row => row.documentId === evidence.document_id && row.version === evidence.document_version);
    if (source && matchesSourceSpan(texts.get(source.documentId)!, evidence.start_offset, evidence.end_offset, evidence.excerpt))
      snapshot.evidence.push({ id: evidence.id, kbId: kb, documentId: source.documentId, documentVersion: source.version,
        stance: "supports", start: evidence.start_offset, end: evidence.end_offset });
  }
  snapshot.assertions = assertions.map(row => ({ id: row.id, kbId: kb, contentState: row.content_state,
    verificationState: row.verification_state, verificationExpiresAt: row.expires_at?.toISOString() ?? null,
    validFrom: null, validUntil: row.valid_until?.toISOString() ?? null, supersededById: row.superseded_by,
    evidenceIds: grounds.filter(e => e.assertion_id === row.id && snapshot.evidence.some(s => s.id === e.id)).map(e => e.id) }));
  // One seed at a time avoids mistaking a truncated multi-seed neighborhood for
  // invalid input while still applying the exact same read-side eligibility.
  for (const relation of input.relations) {
    const one = { ...snapshot, relations: [relation] };
    const projected = projectNeighborhood(one, input.schema, {visibleKbIds: new Set([kb]), now},
      {seedIds: [relation.sourceId], maxHops: 1, maxNodes: 2, maxEdges: 1});
    if (projected.edges.length !== 1) throw new Error("semantic_unsupported_relation");
  }
}

/** Formal release loader; invoked inside the already-authorized read snapshot. */
export class PostgresFormalSemanticLoader {
  private readonly empty: PublishedRelationInput;
  private readonly definition: string;
  constructor(pinned: Pick<PublishedRelationInput, "schema" | "entityTypes">) {
    this.empty = structuredClone({ ...pinned, relations: [], sources: [] });
    this.definition = semanticDefinitionKey(this.empty);
  }
  async load(db: PoolClient, kbIds: string[]): Promise<PublishedRelationInput> {
    if (kbIds.length > 50 || new Set(kbIds).size !== kbIds.length || kbIds.some(id => !UUID.test(id))) throw new Error("semantic_invalid_scope");
    const output = structuredClone(this.empty);
    if (!kbIds.length) return output;
    const rows = (await db.query<{kb_id: string; id: string; generation: number; fingerprint: string; payload: PublicationCommand;
      compile_run_id: string; schema_version_id: string}>(`SELECT h.kb_id,r.id,h.generation,r.fingerprint,r.payload,r.compile_run_id,r.schema_version_id
      FROM karda_kb.semantic_release_head h JOIN karda_kb.semantic_release r
      ON r.kb_id=h.kb_id AND r.id=h.release_id AND r.generation=h.generation WHERE h.kb_id=ANY($1::uuid[]) ORDER BY h.kb_id`, [kbIds])).rows;
    for (const row of rows) {
      const {command, fingerprint} = preparePublication(row.payload), input = decodeSemanticRelease(command);
      if (fingerprint !== row.fingerprint || command.kbId !== row.kb_id || command.expectedGeneration + 1 !== row.generation ||
        (command.payload as {compileRunId: string}).compileRunId !== row.compile_run_id) throw new Error("semantic_corrupt_release");
      const compile = await compiled(db, row.kb_id, row.compile_run_id);
      const definition = (await db.query<{definition_hash: string; definition: unknown}>(`SELECT definition_hash,definition
        FROM karda_kb.semantic_schema_version WHERE kb_id=$1 AND id=$2`, [row.kb_id, row.schema_version_id])).rows[0];
      if (compile.row.schema_version_id !== row.schema_version_id || !definition ||
        semanticValueHash(definition.definition) !== definition.definition_hash || definition.definition_hash !== command.schemaRevision ||
        semanticValueHash({ ...compile.row.candidates, compileRunId: row.compile_run_id }) !== semanticValueHash(command.payload) ||
        command.sourceRevision !== compile.row.input_hash) throw new Error("semantic_corrupt_release");
      if (semanticDefinitionKey(input) !== this.definition) throw new Error("semantic_release_schema_mismatch");
      const relations = (await db.query<{relation_id: string; type: string; source_id: string; target_id: string; origin: string}>(`SELECT relation_id,type,source_id,target_id,origin
        FROM karda_kb.semantic_relation WHERE kb_id=$1 AND release_id=$2 ORDER BY relation_id LIMIT 5001`, [row.kb_id, row.id])).rows;
      const supports = (await db.query<{relation_id: string; assertion_id: string}>(`SELECT relation_id,assertion_id FROM karda_kb.semantic_relation_assertion
        WHERE kb_id=$1 AND release_id=$2 ORDER BY relation_id,assertion_id LIMIT 5001`, [row.kb_id, row.id])).rows;
      const sources = (await db.query<{document_id: string; document_version: number; content_hash: string}>(`SELECT document_id,document_version,content_hash
        FROM karda_kb.semantic_release_source WHERE kb_id=$1 AND release_id=$2 ORDER BY document_id LIMIT 5001`, [row.kb_id, row.id])).rows;
      const normalized = relations.map(r => ({id: r.relation_id, type: r.type, sourceId: r.source_id, targetId: r.target_id,
        origin: r.origin, assertionIds: supports.filter(s => s.relation_id === r.relation_id).map(s => s.assertion_id)}));
      const expected = [...input.relations].sort((a,b) => a.id.localeCompare(b.id)).map(r => ({id: r.id, type: r.type,
        sourceId: r.sourceId, targetId: r.targetId, origin: r.origin, assertionIds: [...r.assertionIds].sort()}));
      if (supports.length > 5000 || semanticValueHash(normalized) !== semanticValueHash(expected) ||
        semanticValueHash(sources.map(s => ({ kbId: row.kb_id, documentId: s.document_id, version: s.document_version, contentHash: s.content_hash }))) !==
        semanticValueHash([...input.sources].sort((a,b) => a.documentId.localeCompare(b.documentId)))) throw new Error("semantic_corrupt_release");
      const bound = (await db.query<ReviewRow>(`SELECT v.id,v.subject_key,v.subject_hash,v.revision,v.decision FROM karda_kb.semantic_release_review b
        JOIN karda_kb.semantic_review v ON v.kb_id=b.kb_id AND v.id=b.review_id WHERE b.kb_id=$1 AND b.release_id=$2 ORDER BY v.subject_key`, [row.kb_id, row.id])).rows;
      acceptedReviews(input, bound);
      if (semanticValueHash(bound) !== command.reviewRevision) throw new Error("semantic_corrupt_release");
      const latest = await latestReviews(db, row.kb_id, input);
      output.relations.push(...input.relations.filter(relation => latest.some(review => review.subject_key === `relation/${relation.id}` &&
        review.id === bound.find(b => b.subject_key === review.subject_key)?.id && review.decision === "accept" &&
        review.subject_hash === subjectHash(input, relation.id))));
      output.sources.push(...input.sources);
      if (output.relations.length > 5000 || output.sources.length > 5000) throw new Error("semantic_snapshot_limit");
    }
    return output;
  }
}
