import { createHash } from "node:crypto";

/** Internal command, constructed by a trusted compiler, never a request body. */
export interface PublicationCommand {
  kbId: string;
  eventId: string;
  expectedGeneration: number;
  sourceRevision: string;
  reviewRevision: string;
  schemaRevision: string;
  payload: unknown;
}

export interface PublicationReceipt {
  releaseId: string;
  generation: number;
  duplicate: boolean;
}

/** A bounded JSON snapshot prevents mutation while waiting for a transaction. */
export function preparePublication(input: PublicationCommand): {
  command: PublicationCommand; json: string; fingerprint: string;
} {
  let nodes = 0;
  const ancestors = new Set<object>();
  function canonical(value: unknown, depth = 0): string {
    if (++nodes > 30000 || depth > 64) throw new Error("publication_payload_limit");
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== "object" || !value || ancestors.has(value)) throw new Error("publication_invalid_json");
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error("publication_invalid_json");
    }
    if (Object.getOwnPropertySymbols(value).length) throw new Error("publication_invalid_json");
    ancestors.add(value);
    const keys = Object.getOwnPropertyNames(value).filter(key => !(array && key === "length"));
    if (array && (keys.length !== value.length || keys.some((key, i) => key !== String(i)))) {
      throw new Error("publication_invalid_json");
    }
    const member = (key:string):string => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error("publication_invalid_json");
      return canonical(descriptor.value, depth + 1);
    };
    // Array keys have already been checked in numeric order. Avoid tuple arrays
    // and two sorts for every nested value while retaining descriptor checks.
    const members = array?keys.map(member):keys.sort().map(key=>`${JSON.stringify(key)}:${member(key)}`);
    ancestors.delete(value);
    return array ? `[${members.join(",")}]` : `{${members.join(",")}}`;
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.kbId) || !uuid.test(input.eventId) || !Number.isSafeInteger(input.expectedGeneration)
    || input.expectedGeneration < 0 || input.expectedGeneration >= 2147483647) throw new Error("publication_invalid_command");
  for (const revision of [input.sourceRevision, input.reviewRevision, input.schemaRevision]) {
    if (typeof revision !== "string" || revision.length < 1 || revision.length > 256) throw new Error("publication_invalid_revision");
  }
  const json = canonical({
    kbId: input.kbId.toLowerCase(), eventId: input.eventId.toLowerCase(), expectedGeneration: input.expectedGeneration,
    sourceRevision: input.sourceRevision, reviewRevision: input.reviewRevision, schemaRevision: input.schemaRevision,
    payload: input.payload,
  });
  if (Buffer.byteLength(json, "utf8") > 262144) throw new Error("publication_payload_limit");
  return { command: JSON.parse(json) as PublicationCommand, json, fingerprint: createHash("sha256").update(json).digest("hex") };
}
