import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { preparePublication, type PublicationCommand, type PublicationReceipt } from "./publication";
import { decodeSemanticRelease } from "./release-format";

export interface PublicationAuthority {
  canPublish: boolean;
  sourceRevision: string;
  reviewRevision: string;
  schemaRevision: string;
}

/**
 * Protocol experiment only: no production DDL, environment factory or route.
 * The future authoritative adapter must lock revision/permission rows until
 * commit, in the same transaction; a cached or unlocked check is insufficient.
 */
export class PostgresPublicationProtocol {
  private readonly schema: string;
  constructor(
    private readonly pool: Pool,
    schema: string,
    private readonly readLockedAuthority: (client: PoolClient, kbId: string) => Promise<PublicationAuthority>,
  ) {
    if (!/^semantic_protocol_test_[a-f0-9]{32}$/.test(schema)) throw new Error("publication_sandbox_required");
    this.schema = `"${schema}"`;
  }

  /** Typed semantic path; the generic protocol remains available for its tests. */
  async publishSemantic(input: PublicationCommand): Promise<PublicationReceipt> {
    const { command } = preparePublication(input);
    decodeSemanticRelease(command);
    return this.publish(command);
  }

  async publish(input: PublicationCommand): Promise<PublicationReceipt> {
    const { command, fingerprint } = preparePublication(input);
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      // Serializes even the first publication (there is no head row to lock).
      // Hash collisions only reduce concurrency, never bypass the CAS.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${this.schema}:${command.kbId}`]);
      const previous = await db.query<{ fingerprint: string; release_id: string; generation: number }>(
        `SELECT fingerprint, release_id, generation FROM ${this.schema}.semantic_event_receipt WHERE kb_id=$1 AND event_id=$2`,
        [command.kbId, command.eventId],
      );
      if (previous.rows[0]) {
        const receipt = previous.rows[0];
        if (receipt.fingerprint !== fingerprint) throw new Error("publication_event_conflict");
        await db.query("COMMIT");
        // Acknowledges that historical event only; does not return a read grant
        // or imply that this release is still the current head.
        return { releaseId: receipt.release_id, generation: receipt.generation, duplicate: true };
      }
      const head = await db.query<{ generation: number }>(
        `SELECT generation FROM ${this.schema}.semantic_release_head WHERE kb_id=$1 FOR UPDATE`, [command.kbId],
      );
      if ((head.rows[0]?.generation ?? 0) !== command.expectedGeneration) throw new Error("publication_stale_generation");
      const authority = await this.readLockedAuthority(db, command.kbId);
      if (authority.canPublish !== true) throw new Error("publication_denied");
      if (authority.sourceRevision !== command.sourceRevision || authority.reviewRevision !== command.reviewRevision
        || authority.schemaRevision !== command.schemaRevision) throw new Error("publication_authority_changed");
      const releaseId = randomUUID(), generation = command.expectedGeneration + 1;
      await db.query(
        `INSERT INTO ${this.schema}.semantic_release (id,kb_id,generation,fingerprint,payload) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [releaseId, command.kbId, generation, fingerprint, JSON.stringify(command)],
      );
      const switched = await db.query(
        `INSERT INTO ${this.schema}.semantic_release_head (kb_id,generation,release_id) VALUES ($1,$2,$3)
         ON CONFLICT (kb_id) DO UPDATE SET generation=EXCLUDED.generation,release_id=EXCLUDED.release_id
         WHERE semantic_release_head.generation=$4 RETURNING generation`,
        [command.kbId, generation, releaseId, command.expectedGeneration],
      );
      if (switched.rowCount !== 1) throw new Error("publication_stale_generation");
      await db.query(
        `INSERT INTO ${this.schema}.semantic_event_receipt (kb_id,event_id,fingerprint,release_id,generation) VALUES ($1,$2,$3,$4,$5)`,
        [command.kbId, command.eventId, fingerprint, releaseId, generation],
      );
      await db.query("COMMIT");
      return { releaseId, generation, duplicate: false };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
}
