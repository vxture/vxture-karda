import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {getKbStore} from "../../../../kb/lib/store";
import {KbService} from "../../../../kb/lib/service";
import {getAttachmentStore} from "../../../../kb/attachments/store";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {getOidcConfig} from "../../../../auth/lib/config";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){
 const auth=await requireAuth("data.read");if(!auth.ok)return auth.response;
 if(req.method==="POST"&&!reviewOriginAllowed(req,getOidcConfig().appOrigin))return NextResponse.json({error:"origin_denied"},{status:403,headers});
 const {id}=await ctx.params;
 if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"invalid_request"},{status:400,headers});
 try{
 const kb=await new KbService(getKbStore()).get(id);
 if(!kb.ok||kb.value.workspaceId!==auth.user.activeWorkspace||kb.value.ownerType!=="user"||!(kb.value.ownerSub===auth.user.sub||["ws_published","org_published"].includes(kb.value.publishState)))return NextResponse.json({error:"not_found"},{status:404,headers});
 const key={workspaceId:auth.user.activeWorkspace,userSub:auth.user.sub,productCode:"karda",kbId:id},store=getAttachmentStore();
 if(req.method==="POST")await store.attach(key);
 return NextResponse.json({attached:await store.isAttached(key)},{headers});
 }catch{return NextResponse.json({error:"attachment_unavailable"},{status:503,headers});}
}
export const GET=handle;export const POST=handle;
