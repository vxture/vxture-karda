/**
 * Explicit one-time first product authorization; requires verified workforce login.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {createHash,timingSafeEqual} from 'node:crypto';
import {operationsPool} from './access';
import {audit} from './store';
export async function bootstrap(sub:string,secret:unknown){
 const expected=process.env.KARDA_OPS_BOOTSTRAP_SHA256,target=process.env.KARDA_OPS_BOOTSTRAP_SUB;
 if(!expected||!/^[a-f0-9]{64}$/.test(expected)||target!==sub||typeof secret!=='string'||secret.length<32||secret.length>512)throw Error('operations_forbidden');
 const digest=createHash('sha256').update(secret).digest();if(!timingSafeEqual(digest,Buffer.from(expected,'hex')))throw Error('operations_forbidden');
 const db=await operationsPool().connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(1903240,49)');if((await db.query('SELECT sub FROM karda_kb.ops_member LIMIT 1')).rowCount)throw Error('operations_bootstrap_closed');
 await db.query('INSERT INTO karda_kb.ops_member(sub,roles) VALUES($1,$2)',[sub,JSON.stringify(['authorization'])]);await audit(db,sub,'bootstrap',sub,'Explicit first product authorizer',{});await db.query('COMMIT');return{bootstrapped:true};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
