import {Pool} from "pg";
import {getObjectStore} from "../storage/objectstore";
import {PostgresSubscriptions} from "./subscription-store";
import {parseSubscription} from "./subscription";
import type {SemanticReadIdentity} from "./read-postgres";
export async function subscriptionService(who:SemanticReadIdentity,input:unknown,admit:()=>Promise<boolean>){
  const command=parseSubscription(input);
  if(!process.env.DATABASE_URL)throw Error("subscription_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{return await new PostgresSubscriptions(pool,getObjectStore(),admit).handle(who,command);}finally{await pool.end();}
}
export function subscriptionFailure(error:unknown){
  const raw=error instanceof Error?error.message:"",known=/^subscription_[a-z_]+$/.test(raw);
  const code=known?raw:raw==="semantic_read_denied"?"subscription_denied":raw==="knowledge_rollout_paused"?"subscription_paused":"subscription_unavailable";
  return {status:/denied/.test(code)?403:/not_found/.test(code)?404:/changed|conflict|cancelled|busy|pending/.test(code)?409:/invalid/.test(code)?400:503,code};
}
