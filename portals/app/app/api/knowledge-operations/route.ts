import {Pool} from "pg";
import {NextResponse} from "next/server";
import {requireAuth} from "../../kb/api/http";
import {getOidcConfig} from "../../auth/lib/config";
import {userAdmission} from "../../platform/admission";
import {reviewOriginAllowed} from "../../kb/semantic/review-request";
import {PostgresOperations} from "../../kb/semantic/operations-postgres";
import {parseOperationCommand,parseOperationsQuery} from "../../kb/semantic/operations";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request){
  let pool:Pool|undefined;
  try{
    if(req.method==="POST"&&(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get("content-type")?.startsWith("application/json")))
      return NextResponse.json({error:"origin_invalid"},{status:403,headers});
    const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
    if(!process.env.DATABASE_URL)throw Error("operations_unavailable");
    const identity={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
    const store=new PostgresOperations(pool,async()=>(await userAdmission(auth.user)).allowed);
    const params=new URL(req.url).searchParams;
    if(req.method==="GET")return NextResponse.json(await store.browse(identity,parseOperationsQuery(params)),{headers});
    if(params.size)throw Error("operations_invalid_request");
    return NextResponse.json(await store.mutate(identity,parseOperationCommand(await req.text())),{headers});
  }catch(error){
    const raw=error instanceof Error?error.message:"",code=/^operations_[a-z_]+$/.test(raw)?raw:"operations_unavailable";
    const status=/denied/.test(code)?403:/not_found/.test(code)?404:/conflict|changed/.test(code)?409:/unavailable/.test(code)?503:400;
    return NextResponse.json({error:code},{status,headers});
  }finally{await pool?.end();}
}
export const GET=handle;
export const POST=handle;
