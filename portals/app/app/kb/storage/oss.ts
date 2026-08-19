// Aliyun OSS object store (KD-019: raw knowledge bytes move to cloud object
// storage). Implements the existing ObjectStore port - the seam objectstore.ts
// declared for exactly this swap ("the seam swaps to S3/MinIO later without
// touching callers"), so upload/download/connector paths are untouched.
//
// Zero-dependency by design (the repo's standing supply-chain posture: pinned
// binaries, hand-rolled MCP, no SDK unless it earns its tree). OSS V4 signing
// (mandatory for buckets created since 2025-09) is ~60 lines over node:crypto,
// and its error-prone half - request canonicalization - is locked to Aliyun's
// OFFICIAL worked example by a golden test (oss.test.ts reproduces the doc's
// CanonicalRequest sha256 c46d9639... exactly).
//
// Wire facts (Aliyun V4 spec):
// - CanonicalURI includes /bucket/key even for virtual-hosted-style requests;
// - CanonicalHeaders = content-type/content-md5 (when present) + all x-oss-*,
//   lowercased, trimmed, newline-terminated; host is NOT signed;
// - HashedPayload: only UNSIGNED-PAYLOAD is currently supported;
// - SigningKey = HMAC chain over "aliyun_v4"+SK / date / region / "oss" /
//   "aliyun_v4_request"; Authorization omits AdditionalHeaders when empty.
import { createHash, createHmac } from "node:crypto";
import { contentHashOf, type ObjectStore, type StoredObject } from "./objectstore";

export interface OssConfig {
  bucket: string;
  /** signing region id, e.g. "cn-beijing" (NOT the endpoint host). */
  region: string;
  /** endpoint host, e.g. "oss-cn-beijing.aliyuncs.com" (no scheme). */
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  fetchImpl?: typeof fetch;
  /** injectable clock for the golden signing test. */
  now?: () => Date;
}

const UNSIGNED = "UNSIGNED-PAYLOAD";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function iso8601Basic(d: Date): { timestamp: string; date: string } {
  const timestamp = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { timestamp, date: timestamp.slice(0, 8) };
}

export interface SignedHeaders {
  authorization: string;
  "x-oss-date": string;
  "x-oss-content-sha256": string;
}

/**
 * V4-sign one request. Exported (not a method) so the golden test can drive it
 * with the spec example's exact inputs.
 */
export function signOssRequest(input: {
  method: "PUT" | "GET" | "DELETE" | "HEAD";
  bucket: string;
  key: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  timestamp: string; // 20250411T064124Z
  /** extra headers to sign (lowercased name -> trimmed value), e.g. content-type. */
  headers?: Record<string, string>;
}): { authorization: string; canonicalRequest: string } {
  const date = input.timestamp.slice(0, 8);
  const signed: Record<string, string> = {
    ...input.headers,
    "x-oss-content-sha256": UNSIGNED,
    "x-oss-date": input.timestamp,
  };
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map((n) => `${n}:${signed[n].trim()}\n`).join("");
  const canonicalRequest = [
    input.method,
    `/${input.bucket}/${input.key}`,
    "", // no query string on any request this client makes
    canonicalHeaders,
    "", // AdditionalHeaders: none - only default-signed headers are sent
    UNSIGNED,
  ].join("\n");

  const scope = `${date}/${input.region}/oss/aliyun_v4_request`;
  const stringToSign = [
    "OSS4-HMAC-SHA256",
    input.timestamp,
    scope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  let key = hmac(`aliyun_v4${input.accessKeySecret}`, date);
  key = hmac(key, input.region);
  key = hmac(key, "oss");
  key = hmac(key, "aliyun_v4_request");
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");

  return {
    authorization: `OSS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope},Signature=${signature}`,
    canonicalRequest,
  };
}

export class OssObjectStore implements ObjectStore {
  constructor(private cfg: OssConfig) {}

  private async request(
    method: "PUT" | "GET" | "DELETE",
    key: string,
    body?: Buffer,
  ): Promise<Response> {
    if (key.includes("..")) throw new Error("invalid object key");
    const { timestamp } = iso8601Basic((this.cfg.now ?? (() => new Date()))());
    const contentType = body ? { "content-type": "application/octet-stream" } : undefined;
    const { authorization } = signOssRequest({
      method,
      bucket: this.cfg.bucket,
      key,
      region: this.cfg.region,
      accessKeyId: this.cfg.accessKeyId,
      accessKeySecret: this.cfg.accessKeySecret,
      timestamp,
      headers: contentType,
    });
    const fetchImpl = this.cfg.fetchImpl ?? fetch;
    // Virtual-hosted-style URL; https only - AK material never rides cleartext.
    return fetchImpl(`https://${this.cfg.bucket}.${this.cfg.endpoint}/${key}`, {
      method,
      headers: {
        authorization,
        "x-oss-date": timestamp,
        "x-oss-content-sha256": UNSIGNED,
        ...contentType,
      },
      body: body as BodyInit | undefined,
      cache: "no-store",
    });
  }

  async put(workspaceId: string, kbId: string, bytes: Buffer): Promise<StoredObject> {
    const hash = contentHashOf(bytes);
    // Same content-addressed key shape as the filesystem store, so a migrated
    // object keeps its document.storage_ref verbatim (rsync/ossutil copy works).
    const key = `${sanitize(workspaceId)}/${sanitize(kbId)}/${hash.slice(0, 2)}/${hash}`;
    const res = await this.request("PUT", key, bytes);
    if (!res.ok) throw new Error(`oss put ${key}: ${res.status}`);
    return { key, contentHash: hash, sizeBytes: bytes.length };
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.request("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`oss get ${key}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<boolean> {
    const res = await this.request("DELETE", key);
    // OSS DeleteObject returns 204 whether or not the object existed.
    if (res.status === 204 || res.status === 404) return true;
    if (!res.ok) throw new Error(`oss delete ${key}: ${res.status}`);
    return true;
  }
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** The OSS store when fully configured, else null (selection in objectstore.ts). */
export function getOssObjectStore(): OssObjectStore | null {
  const bucket = process.env.ALIYUN_OSS_BUCKET;
  const region = process.env.ALIYUN_OSS_REGION;
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
  if (!bucket || !region || !accessKeyId || !accessKeySecret) return null;
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT || `oss-${region}.aliyuncs.com`;
  return new OssObjectStore({ bucket, region, endpoint, accessKeyId, accessKeySecret });
}
