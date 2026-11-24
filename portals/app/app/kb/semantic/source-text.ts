import { createHash } from "node:crypto";
import { canonicalText, decodeSourceBytes, parsePathFor } from "../processing/ir";
import {snapshotValid,type SourceSnapshot} from "../processing/source-snapshot";

export const MAX_SEMANTIC_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_SEMANTIC_TEXT_CHARS = 16 * 1024 * 1024;
export interface SourceTextMetadata {
  activeVersion: number | null;
  contentState: string;
  mime: string | null;
  contentHash: string | null;
  normalized?:SourceSnapshot|null;
}

/** Native text or a pinned immutable normalization, always bound to raw bytes. */
export function verifiedSourceText(metadata: SourceTextMetadata, bytes: Buffer | null): string | null {
  if (metadata.contentState !== "indexed" || !Number.isSafeInteger(metadata.activeVersion) ||
      (metadata.activeVersion ?? 0) < 1 || !metadata.contentHash || !/^[a-f0-9]{64}$/.test(metadata.contentHash) ||
      !bytes ||
      bytes.length > MAX_SEMANTIC_SOURCE_BYTES ||
      createHash("sha256").update(bytes).digest("hex") !== metadata.contentHash) return null;
  if(parsePathFor(metadata.mime??"")==="fast")return canonicalText(decodeSourceBytes(bytes));
  const normalized=metadata.normalized;
  return normalized&&snapshotValid(normalized)&&normalized.mime===metadata.mime&&normalized.contentHash===metadata.contentHash?normalized.text:null;
}

/** UTF-16 half-open offsets, exactly as measured by the existing parser. */
export function matchesSourceSpan(text: string, start: number, end: number, excerpt: string): boolean {
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < end &&
    end <= text.length && text.slice(start, end) === excerpt;
}
