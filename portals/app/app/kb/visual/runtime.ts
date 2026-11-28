import {Pool} from 'pg';
import {getObjectStore} from '../storage/objectstore';
import {admitProductionOwner} from '../production/runtime';
import {VisualStore} from './store';
import {VisualWorker} from './worker';
let busy=false,started=false,cursor:string|null=null;
export function visualPool(){if(!process.env.DATABASE_URL)throw Error('visual_unavailable');return new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});}
export async function visualPass(){if(busy||!process.env.DATABASE_URL)return;busy=true;const pool=visualPool();let lock;try{lock=await pool.connect();if(!(await lock.query('SELECT pg_try_advisory_lock(1903240,48) AS locked')).rows[0].locked)return;const store=new VisualStore(pool,getObjectStore(),admitProductionOwner),worker=new VisualWorker(store),runs=(await pool.query("SELECT * FROM karda_kb.visual_run WHERE state='active' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 10",[cursor])).rows;cursor=runs.length?runs.at(-1).id:null;for(const r of runs){const who={workspaceId:r.workspace_id,sub:r.created_by,roles:[],productCode:'karda'};try{const work=await worker.claim(who,r.kb_id,r.id);if(work)await worker.run(who,work.run,work.asset);}catch{/* Current authority failure retains durable work for owner recovery. */}}}finally{if(lock){await lock.query('SELECT pg_advisory_unlock(1903240,48)').catch(()=>{});lock.release();}await pool.end();busy=false;}}
export function startVisualDispatch(){if(started)return;started=true;setTimeout(()=>void visualPass().catch(()=>{}),14000).unref();setInterval(()=>void visualPass().catch(()=>{}),10000).unref();}
