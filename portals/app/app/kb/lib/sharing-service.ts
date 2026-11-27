import {Pool} from "pg";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {PostgresSharing} from "./sharing-postgres";
import {parseSharing} from "./sharing";
export async function sharingService(who:SemanticReadIdentity,kbId:string,input:unknown,admit:()=>Promise<boolean>,browse=false,before?:number){
 const command=browse?null:parseSharing(input);if(!process.env.DATABASE_URL)throw Error("sharing_unavailable");
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
 try{const store=new PostgresSharing(pool,admit);return browse?await store.browse(who,kbId,before):await store.mutate(who,kbId,command!);}finally{await pool.end();}
}
export function sharingFailure(error:unknown){const raw=error instanceof Error?error.message:"",code=/^sharing_[a-z_]+$/.test(raw)?raw:"sharing_unavailable";
 return {code,status:/denied/.test(code)?403:/changed|conflict/.test(code)?409:/invalid/.test(code)?400:503};}
