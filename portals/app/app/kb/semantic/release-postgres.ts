import type { PoolClient } from "pg";
import type { PublicationCommand } from "./publication";
import { preparePublication } from "./publication";
import type { PublishedRelationInput } from "./read-postgres";
import { decodeSemanticRelease, semanticDefinitionKey } from "./release-format";
import { validateOntology } from "./projection";

/** Sandbox-only bridge; call using the reader's existing snapshot transaction. */
export class PostgresSemanticReleaseLoader {
  private readonly schema: string;
  private readonly definition: string;
  private readonly empty: PublishedRelationInput;
  constructor(namespace: string, pinned: Pick<PublishedRelationInput, "schema" | "entityTypes">) {
    if (!/^semantic_protocol_test_[a-f0-9]{32}$/.test(namespace)) throw new Error("publication_sandbox_required");
    this.schema = `"${namespace}"`;
    validateOntology(pinned.schema);
    this.empty = structuredClone({ ...pinned, relations: [], sources: [] });
    this.definition = semanticDefinitionKey(this.empty);
  }

  async load(db: PoolClient, kbIds: string[]): Promise<PublishedRelationInput> {
    if (kbIds.length > 50 || kbIds.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))) {
      throw new Error("semantic_invalid_scope");
    }
    const output = structuredClone(this.empty);
    if (!kbIds.length) return output;
    const { rows } = await db.query<{ kb_id: string; generation: number; fingerprint: string | null; payload: PublicationCommand | null }>(`
      SELECT h.kb_id,h.generation,r.fingerprint,r.payload
      FROM ${this.schema}.semantic_release_head h LEFT JOIN ${this.schema}.semantic_release r
        ON r.id=h.release_id AND r.kb_id=h.kb_id AND r.generation=h.generation
      WHERE h.kb_id=ANY($1::uuid[]) ORDER BY h.kb_id`, [kbIds]);
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.payload || seen.has(row.kb_id)) throw new Error("semantic_corrupt_release");
      seen.add(row.kb_id);
      const prepared = preparePublication(row.payload);
      if (prepared.command.kbId !== row.kb_id || prepared.command.expectedGeneration + 1 !== row.generation ||
          prepared.fingerprint !== row.fingerprint) throw new Error("semantic_corrupt_release");
      const release = decodeSemanticRelease(prepared.command);
      if (semanticDefinitionKey(release) !== this.definition) throw new Error("semantic_release_schema_mismatch");
      output.relations.push(...release.relations);
      output.sources.push(...release.sources);
      if (output.relations.length > 5000 || output.sources.length > 5000) throw new Error("semantic_snapshot_limit");
    }
    return output;
  }
}
