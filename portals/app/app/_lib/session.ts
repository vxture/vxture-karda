import type { SessionUser } from "./api";

/**
 * Which rung of the role ladder this session holds.
 *
 * The ladder was computed TWICE - once in the header's user menu, once in the
 * scope panel - and the two copies had already diverged in the way that
 * matters: the header read its words from the catalog, the panel hardcoded
 * Chinese, so switching to en-US left the same person labelled "Admin" in one
 * place and 管理员 in the other. Which rung applies is a fact about the
 * session and is identical in every language; only the word is language.
 */
export type SessionRole = "owner" | "admin" | "member";

export function sessionRole(user: SessionUser | null | undefined): SessionRole {
  if (user?.isWorkspaceOwner) return "owner";
  if (user?.canManage) return "admin";
  return "member";
}
