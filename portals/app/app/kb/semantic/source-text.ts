import { createHash } from "node:crypto";
import { canonicalText, decodeSourceBytes, parsePathFor } from "../processing/ir";

export const MAX_SEMANTIC_SOURCE_BYTES = 8 * 1024 * 1024;
export interface SourceTextMetadata {
  activeVersion: number | null;
  contentState: string;
  mime: string | null;
  contentHash: string | null;
}

/** Native text only. The current hash binds object bytes to the DB snapshot. */
export function verifiedSourceText(metadata: SourceTextMetadata, bytes: Buffer | null): string | null {
  if (metadata.contentState !== "indexed" || !Number.isSafeInteger(metadata.activeVersion) ||
      (metadata.activeVersion ?? 0) < 1 || !metadata.contentHash || !/^[a-f0-9]{64}$/.test(metadata.contentHash) ||
      parsePathFor(metadata.mime ?? "application/octet-stream") !== "fast" || !bytes ||
      bytes.length > MAX_SEMANTIC_SOURCE_BYTES ||
      createHash("sha256").update(bytes).digest("hex") !== metadata.contentHash) return null;
  return canonicalText(decodeSourceBytes(bytes));
}

/** UTF-16 half-open offsets, exactly as measured by the existing parser. */
export function matchesSourceSpan(text: string, start: number, end: number, excerpt: string): boolean {
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < end &&
    end <= text.length && text.slice(start, end) === excerpt;
}
