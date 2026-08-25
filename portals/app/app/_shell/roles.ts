import type { shell } from "../_i18n/messages/shell";
import type { SessionRole } from "../_lib/session";

/** Role rung -> the shell-catalog entry that names it. Both the header's user
 *  menu and the scope panel read this, so the two can no longer disagree. */
export const ROLE_LABEL_KEY = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
} as const satisfies Record<SessionRole, keyof typeof shell>;
