import { createHash } from "node:crypto";

/** Trusted local template/script; untrusted corpus data must remain inert JSON. */
export function renderOfflineReviewHtml(template: string, javascript: string, data: object): string {
  if (template.split("__SCRIPT__").length !== 2 || template.split("__SCRIPT_HASH__").length !== 2) throw new Error("invalid_review_template");
  const escaped = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  const script = "const DATA=" + escaped + ";\n" + javascript.replace(/\r\n/g, "\n");
  const hash = "sha256-" + createHash("sha256").update(script).digest("base64");
  return template.replace(/\r\n/g, "\n").replace("__SCRIPT_HASH__", () => hash).replace("__SCRIPT__", () => script);
}
