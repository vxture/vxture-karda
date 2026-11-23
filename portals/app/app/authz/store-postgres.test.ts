import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import type { RoleDatabase, RoleSql } from "./store";
import { verifyRoleTransactions } from "./store.integration";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("explicit roles: concurrent defaults, role removal, owner transfer and isolation",{skip:!endpoint},async()=>{
 const url=new URL(endpoint!);
 assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
 assert.equal(url.pathname,"/karda_p3_test");
 const pool=new Pool({connectionString:endpoint});
 const sql=(client:Pick<Pool,"query">):RoleSql=>({
  $queryRawUnsafe:async<T>(query:string,...values:unknown[]) => (await client.query(query,values)).rows as T,
  $executeRawUnsafe:async(query:string,...values:unknown[]) => (await client.query(query,values)).rowCount??0,
 });
 const db:RoleDatabase={...sql(pool),$transaction:async(work)=>{
  const client=await pool.connect();
  try {await client.query("BEGIN"); const result=await work(sql(client));await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
 }};
 try{await verifyRoleTransactions(db);}finally{await pool.end();}
});
