import {Pool} from "pg";
import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {getOidcConfig} from "../../../../auth/lib/config";
import {reviewOriginAllowed} from "../../../../kb/semantic/review-request";
import {PostgresProfiles} from "../../../../kb/semantic/profile-store";
import {parseProfileCommand} from "../../../../kb/semantic/profile-config";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){
  let pool:Pool|undefined;
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))
      return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("service.publish");if(!auth.ok)return auth.response;
    if(!process.env.DATABASE_URL)throw Error("profile_unavailable");
    const {id}=await ctx.params,who={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
    const store=new PostgresProfiles(pool,async()=>(await userAdmission(auth.user)).allowed),params=new URL(req.url).searchParams;
    if(req.method==="GET"){
      if([...params.keys()].some(k=>!["id","before","historyBefore"].includes(k))||[...params.keys()].some(k=>params.getAll(k).length!==1)||
        (params.has("historyBefore")&&!/^\d{1,10}$/.test(params.get("historyBefore")!)))throw Error("profile_invalid_request");
      return NextResponse.json(await store.browse(who,id,{...(params.has("id")?{id:params.get("id")!}:{}),
        ...(params.has("before")?{before:params.get("before")!}:{}),...(params.has("historyBefore")?{historyBefore:Number(params.get("historyBefore"))}:{})}),{headers});
    }
    if(params.size)throw Error("profile_invalid_request");
    return NextResponse.json(await store.mutate(who,id,parseProfileCommand(await req.text())),{headers});
  }catch(error){
    const raw=error instanceof Error?error.message:"",code=/^profile_[a-z_]+$/.test(raw)?raw:"profile_unavailable";
    const status=/denied/.test(code)?403:/conflict|unmapped/.test(code)?409:/invalid/.test(code)?400:503;
    return NextResponse.json({error:code},{status,headers});
  }finally{await pool?.end();}
}
export const GET=handle;
export const POST=handle;
