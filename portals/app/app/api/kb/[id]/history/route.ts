import {Pool} from "pg";
import {NextResponse} from "next/server";
import {requireAuth} from "../../../../kb/api/http";
import {userAdmission} from "../../../../platform/admission";
import {PostgresSemanticStore} from "../../../../kb/semantic/store-postgres";

export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const headers={"Cache-Control":"private, no-store"};
  const auth=await requireAuth("service.publish");if(!auth.ok)return auth.response;
  let pool:Pool|undefined;
  try{
    const url=new URL(req.url),raw=url.searchParams.get("before");
    if([...url.searchParams.keys()].some(k=>k!=="before")||(raw!==null&&!/^[1-9][0-9]{0,9}$/.test(raw)))throw new Error("semantic_invalid_history");
    if(!process.env.DATABASE_URL)throw new Error("semantic_history_unavailable");
    const {id}=await ctx.params;
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
    const store=new PostgresSemanticStore(pool,{get:async()=>{throw new Error("semantic_audit_no_source_reads");}},async()=>(await userAdmission(auth.user)).allowed);
    const result=await store.auditHistory({workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"},id,raw===null?undefined:Number(raw));
    return NextResponse.json(result,{headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    return NextResponse.json({error:["semantic_invalid_history","semantic_write_denied","semantic_history_budget"].includes(code)?code:"semantic_history_unavailable"},
      {status:code==="semantic_invalid_history"?400:code==="semantic_write_denied"?403:503,headers});
  }finally{await pool?.end();}
}
