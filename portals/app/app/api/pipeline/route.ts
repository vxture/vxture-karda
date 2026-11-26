import {Pool} from "pg";
import {NextResponse} from "next/server";
import {requireAuth} from "../../kb/api/http";
import {userAdmission} from "../../platform/admission";
import {PostgresWorkCenter} from "../../kb/processing/work-center-postgres";
import {parseWorkQuery} from "../../kb/processing/work-center";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(req:Request){
  let pool:Pool|undefined;
  try{
    const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
    const query=parseWorkQuery(new URL(req.url).searchParams);
    if(!process.env.DATABASE_URL)throw Error("work_unavailable");
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
    const identity={workspaceId:auth.user.activeWorkspace,sub:auth.user.sub,roles:[...auth.user.roles],productCode:"karda"};
    const store=new PostgresWorkCenter(pool,async()=>(await userAdmission(auth.user)).allowed);
    return NextResponse.json(await store.read(identity,query),{headers});
  }catch(error){
    const raw=error instanceof Error?error.message:"",code=/^work_[a-z_]+$/.test(raw)?raw:"work_unavailable";
    const status=/denied/.test(code)?403:/changed/.test(code)?409:/invalid/.test(code)?400:503;
    return NextResponse.json({error:code},{status,headers});
  }finally{await pool?.end();}
}
