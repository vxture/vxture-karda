import {NextResponse} from "next/server";
import {getOidcConfig} from "../../../auth/lib/config";
import {bootstrapOwnership} from "../../../authz/store";
import {cookies} from "next/headers";
import {resolveSessionUser} from "../../../auth/lib/session";
import {userPlatformContext} from "../../../platform/user-context";
import {productAssigned} from "../../../platform/access";
import {getEntitlementResolver} from "../../../entitlement/resolver";
import {hasProductAccess} from "../../../entitlement/types";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function POST(req:Request){
 if(req.headers.get("origin")!==getOidcConfig().appOrigin || req.headers.get("sec-fetch-site")==="cross-site") return NextResponse.json({error:"origin_invalid"},{status:403,headers});
 if(!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({error:"json_required"},{status:415,headers});
 try{
  const text=await req.text();
  if(text.length>128||JSON.parse(text)?.confirm!=="initialize_product_owner") return NextResponse.json({error:"confirmation_required"},{status:400,headers});
  const cfg=getOidcConfig();
  const result=await resolveSessionUser(cfg,(await cookies()).get(cfg.cookieName)?.value);
  const user=result.user;
  if(!result.available||!user||!user.activeWorkspace||user.accountStatus!=="active")return NextResponse.json({error:"unauthenticated"},{status:401,headers});
  const context=await userPlatformContext(user);
  const identity={workspaceId:user.activeWorkspace,sub:user.sub,roles:user.roles};
  await bootstrapOwnership(identity,async()=>await productAssigned(context)&&hasProductAccess(await getEntitlementResolver().resolve(context.workspaceId,context)));
  return NextResponse.json({ok:true},{headers});
 }catch(error){
  const code=error instanceof Error?error.message:"unavailable";
  const denied=["role_forbidden","target_not_authorized","member_inactive","owner_already_initialized"].includes(code);
  return NextResponse.json({error:denied?code:"bootstrap_unavailable"},{status:denied?403:503,headers});
 }
}
