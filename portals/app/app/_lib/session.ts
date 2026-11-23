import type { SessionUser } from "./api";
export type SessionRole = "owner" | "admin" | "member" | "readonly" | "guest" | "none";
/** Platform governance flags do not grant product roles. */
export function sessionRole(user: SessionUser | null | undefined): SessionRole {
 const roles=user?.productAccess?.roles??[];
 if(roles.includes("owner")) return "owner";
 if(roles.includes("administrator")) return "admin";
 if(roles.includes("member")) return "member";
 if(roles.includes("readonly")) return "readonly";
 if(roles.includes("guest")) return "guest";
 return "none";
}
