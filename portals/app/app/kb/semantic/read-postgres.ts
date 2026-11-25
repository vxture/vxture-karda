import type { Pool, PoolClient } from "pg";
import { permits } from "../../authz/policy";
import { readProductAccess, type MemberIdentity, type RoleSql } from "../../authz/store";
import type { ObjectStore } from "../storage/objectstore";
import type { GraphProjection, KnowledgeSnapshot, NeighborhoodQuery, OntologySchema, SemanticRelation } from "./contracts";
import { projectNeighborhood, projectDirectory, validateNeighborhoodQuery, validateOntology } from "./projection";
import { matchesSourceSpan, MAX_SEMANTIC_SOURCE_BYTES, MAX_SEMANTIC_TEXT_CHARS, verifiedSourceText } from "./source-text";
import {parsePathFor} from "../processing/ir";
import {readSourceSnapshot,type SourceSnapshot} from "../processing/source-snapshot";

export interface SemanticReadIdentity extends MemberIdentity {
  /** Verified consumer context, never accepted from an HTTP request body. */
  productCode: string;
}
export interface PublishedRelationInput {
  schema: OntologySchema;
  /** Explicit legacy-kind mapping owned by the pinned ontology adapter. */
  entityTypes: ReadonlyMap<string, string>;
  relations: SemanticRelation[];
  /** Frozen by the compiler; hash is of raw bytes, version is the offset space. */
  sources: { kbId: string; documentId: string; version: number; contentHash: string }[];
}
export type SemanticReadResult = GraphProjection & { sourceStatus: "complete" | "partial" };
export type KnowledgePackage = SemanticReadResult & {
  format:"karda.knowledge-package.v1";
  statements:{id:string;statement:string}[];
  passages:{evidenceId:string;excerpt:string}[];
  gaps:string[];
};
interface AssertionRow {
  id: string; kb_id: string; content_state: string; verification_state: string;
  expires_at: Date | null; valid_until: Date | null; superseded_by: string | null;
}
interface EvidenceRow {
  id: string; assertion_id: string; kb_id: string; document_id: string;
  document_version: number; start_offset: number; end_offset: number; excerpt: string;
  active_chunk_version: number | null; content_state: string; mime: string | null;
  content_hash: string | null; storage_ref: string | null; size_bytes: string | null;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_ROWS = 5000;
function bounded<T>(rows: T[]): T[] {
  if (rows.length > MAX_ROWS) throw new Error("semantic_snapshot_limit");
  return rows;
}

/**
 * Internal, same-workspace adapter with version-bound source text. No env factory
 * or HTTP/Agent wiring. Platform admission and published relations are mandatory
 * trusted dependencies; the old cached visible-set is deliberately not used.
 */
export class PostgresSemanticReader {
  constructor(
    private readonly pool: Pool,
    private readonly objects: Pick<ObjectStore, "get">,
    private readonly admitPlatform: (identity: SemanticReadIdentity) => Promise<boolean>,
    private readonly loadPublished: (db: PoolClient, kbIds: string[]) => Promise<PublishedRelationInput>,
  ) {}

  async read(identity: SemanticReadIdentity, kbIds: string[], query: NeighborhoodQuery): Promise<SemanticReadResult> {
    const value=await this.readPackage(identity,kbIds,query);
    return {schema:value.schema,nodes:value.nodes,edges:value.edges,assertions:value.assertions,evidence:value.evidence,
      truncated:value.truncated,sourceStatus:value.sourceStatus};
  }

  async readPackage(identity: SemanticReadIdentity, kbIds: string[], query: NeighborhoodQuery, directory=false,exporting=false,transaction?:PoolClient): Promise<KnowledgePackage> {
    // Capture caller-owned inputs before awaiting either authority or the pool.
    identity = { ...identity, roles: [...identity.roles] };
    kbIds = [...new Set(kbIds.map(id => id.toLowerCase()))];
    query = { ...query, seedIds: [...query.seedIds], relationTypes: query.relationTypes ? [...query.relationTypes] : undefined };
    validateNeighborhoodQuery(query);
    if (kbIds.length < 1 || kbIds.length > 50 || !kbIds.every(id => UUID.test(id)) ||
        !/^[a-z][a-z0-9_-]{0,31}$/.test(identity.productCode)) throw new Error("semantic_invalid_scope");
    if (await this.admitPlatform(identity) !== true) throw new Error("semantic_read_denied");
    const db = transaction??await this.pool.connect();
    try {
      if(!transaction)await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const sql: RoleSql = {
        $queryRawUnsafe: async <T>(statement: string, ...values: unknown[]) => (await db.query(statement, values)).rows as T,
        $executeRawUnsafe: async () => { throw new Error("semantic_read_only"); },
      };
      // Local role/owner-anchor evaluation shares the source/release snapshot.
      const access = await readProductAccess(identity, sql);
      if (!permits(access, "product.enter") || !permits(access, "data.read") || (exporting&&!permits(access,"data.export"))) throw new Error("semantic_read_denied");
      const visible = (await db.query<{ id: string }>(`
        SELECT k.id FROM karda_kb.knowledge_base k
        JOIN karda_kb.kb_attachment a ON a.kb_id=k.id AND a.workspace_id=k.workspace_id
        WHERE k.id=ANY($1::uuid[]) AND k.workspace_id=$2::uuid AND k.deleted_at IS NULL
          AND k.owner_type='user' AND (k.owner_sub=$3 OR k.publish_state IN ('ws_published','org_published'))
          AND a.user_sub=$3 AND a.product_code=$4 ORDER BY k.id`,
        [kbIds, identity.workspaceId, identity.sub, identity.productCode])).rows.map(row => row.id);
      const published = structuredClone(await this.loadPublished(db, [...visible]));
      validateOntology(published.schema);
      const visibleSet = new Set(visible);
      const relations = bounded(published.relations.filter(row => visibleSet.has(row.kbId)));
      const manifest = new Map<string, PublishedRelationInput["sources"][number]>();
      for (const source of bounded(published.sources.filter(row => visibleSet.has(row.kbId)))) {
        if (manifest.has(source.documentId) || !UUID.test(source.documentId) || !Number.isSafeInteger(source.version) ||
            source.version < 1 || !/^[a-f0-9]{64}$/.test(source.contentHash)) throw new Error("semantic_invalid_manifest");
        manifest.set(source.documentId, source);
      }
      const entityIds = [...new Set(relations.flatMap(r => [r.sourceId, r.targetId]))];
      const assertionIds = [...new Set(relations.flatMap(r => r.assertionIds))];
      if (entityIds.length > MAX_ROWS || assertionIds.length > MAX_ROWS ||
          ![...entityIds, ...assertionIds].every(id => UUID.test(id))) throw new Error("semantic_invalid_release");
      const entities = bounded((await db.query<{id: string; kb_id: string; kind: string; name: string}>(`
        SELECT id,kb_id,kind,name FROM karda_kb.entity WHERE kb_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) LIMIT 5001`,
        [visible, entityIds])).rows).flatMap(row => {
        const type = published.entityTypes.get(row.kind);
        return type && published.schema.entityTypes.includes(type) ? [{ id: row.id, kbId: row.kb_id, type, label: row.name }] : [];
      });
      const assertions = bounded((await db.query<AssertionRow>(`
        SELECT id,kb_id,content_state,verification_state,expires_at,valid_until,superseded_by
        FROM karda_kb.assertion WHERE kb_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) LIMIT 5001`,
        [visible, assertionIds])).rows);
      const grounds = bounded((await db.query<EvidenceRow>(`
        SELECT e.id,e.assertion_id,a.kb_id,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt,
          d.active_chunk_version,d.content_state,d.mime,d.content_hash,d.storage_ref,d.size_bytes
        FROM karda_kb.evidence e JOIN karda_kb.assertion a ON a.id=e.assertion_id
        JOIN karda_kb.span s ON s.id=e.span_id JOIN karda_kb.document d ON d.id=s.document_id AND d.kb_id=a.kb_id
        WHERE a.kb_id=ANY($1::uuid[]) AND a.id=ANY($2::uuid[])
          AND e.stance='supports' AND e.supports_id IS NULL
          AND d.content_state='indexed' ORDER BY e.id LIMIT 5001`,
        [visible, assertionIds])).rows);
      const snapshot: KnowledgeSnapshot = { entities, relations, assertions: [], evidence: [], sources: [] };
      const texts = new Map<string, string | null>();
      const normalizedSources=new Map<string,SourceSnapshot>();
      let incomplete = false;
      let bytesBudget = 32 * 1024 * 1024;
      let textBudget = MAX_SEMANTIC_TEXT_CHARS;
      for (const row of grounds) {
        const source = manifest.get(row.document_id);
        if (!source || source.kbId !== row.kb_id || source.version !== row.document_version ||
            row.document_version !== row.active_chunk_version || source.contentHash !== row.content_hash) {
          incomplete = true; continue;
        }
        if (!texts.has(row.document_id)) {
          let text: string | null = null;
          const size = row.size_bytes === null ? NaN : Number(row.size_bytes);
          if (row.storage_ref && Number.isSafeInteger(size) && size >= 0 && size <= MAX_SEMANTIC_SOURCE_BYTES) {
            if (size > bytesBudget || texts.size >= 100) throw new Error("semantic_source_budget");
            bytesBudget -= size;
            // Backend failure aborts the read; a missing/mismatched object only
            // removes its evidence. No excerpts or chunk lengths substitute.
            const bytes = await this.objects.get(row.storage_ref);
            const normalized=parsePathFor(row.mime??"")==="fast"?null:
              await readSourceSnapshot(async(sql,...values)=>(await db.query(sql,values)).rows,row.document_id,row.document_version);
            text = verifiedSourceText({ activeVersion: row.active_chunk_version, contentState: row.content_state,
              mime: row.mime, contentHash: row.content_hash,normalized }, bytes?.length === size ? bytes : null);
            if(text!==null){textBudget-=text.length;if(textBudget<0)throw new Error("semantic_source_budget");}
            if(text!==null&&normalized)normalizedSources.set(row.document_id,normalized);
          }
          texts.set(row.document_id, text);
          if (text !== null) snapshot.sources.push({ kbId: row.kb_id, documentId: row.document_id,
            version: row.document_version, current: true, withdrawn: false, textLength: text.length });
        }
        const text = texts.get(row.document_id);
        if (text === null || text === undefined || !matchesSourceSpan(text, row.start_offset, row.end_offset, row.excerpt)) {
          incomplete = true; continue;
        }
        const pages=[...new Set(normalizedSources.get(row.document_id)?.locators.filter(l=>l.page!==undefined&&l.start<row.end_offset&&l.end>row.start_offset).map(l=>l.page!)??[])];
        snapshot.evidence.push({ id: row.id, kbId: row.kb_id, documentId: row.document_id,
          documentVersion: row.document_version, stance: "supports", start: row.start_offset, end: row.end_offset,...(pages.length?{pages}:{}) });
      }
      const eligibleEvidence = new Set(snapshot.evidence.map(row => row.id));
      const evidenceIds = new Map<string, string[]>();
      for (const row of grounds) if (eligibleEvidence.has(row.id)) {
        const ids = evidenceIds.get(row.assertion_id) ?? []; ids.push(row.id); evidenceIds.set(row.assertion_id, ids);
      }
      snapshot.assertions = assertions.map(row => ({ id: row.id, kbId: row.kb_id,
        contentState: row.content_state, verificationState: row.verification_state,
        verificationExpiresAt: row.expires_at?.toISOString() ?? null, validUntil: row.valid_until?.toISOString() ?? null,
        validFrom: null, supersededById: row.superseded_by, evidenceIds: evidenceIds.get(row.id) ?? [] }));
      const clock = await db.query<{ now: Date }>("SELECT statement_timestamp() AS now");
      const scope={visibleKbIds:visibleSet,now:clock.rows[0].now.toISOString()};
      // Directory selects across the complete eligible snapshot after authority,
      // source and premise checks. Hidden/rejected rows cannot consume its budget.
      const result = directory?projectDirectory(snapshot,published.schema,scope,query):
        projectNeighborhood(snapshot, published.schema, scope, query);
      // Enrich only the final eligible projection, in the same authorized snapshot.
      const ids=result.assertions.map(a=>a.id);
      const statements=ids.length?(await db.query<{id:string;statement:string}>(`SELECT id,statement FROM karda_kb.assertion
        WHERE kb_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) ORDER BY id`,[visible,ids])).rows:[];
      const passages=result.evidence.map(e=>({evidenceId:e.id,excerpt:grounds.find(g=>g.id===e.id)!.excerpt}));
      if(!transaction)await db.query("COMMIT");
      return { ...result, sourceStatus: incomplete ? "partial" : "complete",format:"karda.knowledge-package.v1",statements,passages,
        gaps:[...(result.edges.length?[]:["no_published_support"]),...(incomplete?["source_support_unavailable"]:[]),
          ...(result.truncated?["neighborhood_truncated"]:[])] };
    } catch (error) {
      if(!transaction)await db.query("ROLLBACK"); throw error;
    } finally { if(!transaction)db.release(); }
  }
}
