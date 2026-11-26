import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "./read-postgres";
import {PROFILE_UUID,parseProfileCommand,type CompileProfile,type ProfileCommand} from "./profile-config";
import {activeCompileProfile,profileHash} from "./profile-authority";
import {localCompileProfile} from "./compile-profile";
export interface ProfileVersion {id:string;title:string;definition:CompileProfile;definition_hash:string;created_at:string}
export interface ProfileHistory {revision:number;profile_id:string|null;note:string;created_by:string;created_at:string}
export interface ProfileResult {format:"karda.compile-profiles.v1";kbId:string;current:CompileProfile;activeId:string|null;revision:number;
  versions:ProfileVersion[];history:ProfileHistory[];nextBefore:string|null;nextHistoryBefore:number|null;unmappedKinds:string[];bootstrap:CompileProfile}
export class PostgresProfiles{
  constructor(private pool:Pool,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  private async scope<T>(who:SemanticReadIdentity,kbId:string,work:(db:PoolClient)=>Promise<T>):Promise<T>{
    if(!PROFILE_UUID.test(kbId)||!PROFILE_UUID.test(who.workspaceId)||who.productCode!=="karda"||!/^usr_[a-f0-9-]{36}$/i.test(who.sub))throw Error("profile_invalid_scope");
    if(await this.admit(who)!==true)throw Error("profile_denied");
    const db=await this.pool.connect();try{
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:roles:${who.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:semantic:${kbId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[who.workspaceId,who.sub]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("profile_denied");}};
      const access=await readProductAccess(who,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write")||!permits(access,"service.publish"))throw Error("profile_denied");
      if((await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user' AND owner_sub=$3
        AND deleted_at IS NULL FOR SHARE`,[kbId,who.workspaceId,who.sub])).rowCount!==1)throw Error("profile_denied");
      const result=await work(db);await db.query("COMMIT");return result;
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  async browse(who:SemanticReadIdentity,kbId:string,query:{before?:string;historyBefore?:number;id?:string}={}):Promise<ProfileResult>{
    if((query.before!==undefined&&!PROFILE_UUID.test(query.before))||(query.id!==undefined&&!PROFILE_UUID.test(query.id))||
      (query.historyBefore!==undefined&&(!Number.isSafeInteger(query.historyBefore)||query.historyBefore<1||query.historyBefore>2147483647))||
      (query.id&&query.before))throw Error("profile_invalid_request");
    return this.scope(who,kbId,async db=>{
      const current=await activeCompileProfile(db,kbId),latest=(await db.query<ProfileHistory>("SELECT * FROM karda_kb.compile_profile_activation WHERE kb_id=$1 ORDER BY revision DESC LIMIT 1",[kbId])).rows[0];
      const rows=(await db.query<ProfileVersion>(`SELECT id,title,definition,definition_hash,created_at FROM karda_kb.compile_profile_version WHERE kb_id=$1
        AND ($2::uuid IS NULL OR id<$2) AND ($3::uuid IS NULL OR id=$3) ORDER BY id DESC LIMIT 21`,[kbId,query.before??null,query.id??null])).rows;
      for(const r of rows)if(profileHash(r.definition)!==r.definition_hash)throw Error("profile_corrupt");
      const history=(await db.query<ProfileHistory>(`SELECT revision,profile_id,note,created_by,created_at FROM karda_kb.compile_profile_activation
        WHERE kb_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 21`,[kbId,query.historyBefore??null])).rows;
      return {format:"karda.compile-profiles.v1",kbId,current,activeId:latest?.profile_id??null,revision:latest?.revision??0,versions:rows.slice(0,20),
        history:history.slice(0,20),nextBefore:rows.length>20?rows[19].id:null,nextHistoryBefore:history.length>20?history[19].revision:null,
        unmappedKinds:await this.unmapped(db,kbId,current),bootstrap:localCompileProfile()};
    });
  }
  private async unmapped(db:PoolClient,kbId:string,p:CompileProfile):Promise<string[]>{
    const rows=(await db.query<{kind:string}>("SELECT DISTINCT kind FROM karda_kb.entity WHERE kb_id=$1 AND NOT(kind=ANY($2::text[])) ORDER BY kind LIMIT 101",[kbId,p.entityTypes.map(m=>m.kind)])).rows;
    if(rows.length>100)throw Error("profile_entity_budget");return rows.map(r=>r.kind);
  }
  async mutate(who:SemanticReadIdentity,kbId:string,input:ProfileCommand){
    const c=parseProfileCommand(JSON.stringify(input));
    return this.scope(who,kbId,async db=>{
      if(c.action==="save"){
        const hash=profileHash(c.definition),s=c.definition.schema;
        const existing=(await db.query<ProfileVersion>(`SELECT * FROM karda_kb.compile_profile_version WHERE kb_id=$1 AND
          (id=$2 OR (schema_id=$3 AND schema_version=$4))`,[kbId,c.id,s.schemaId,s.version])).rows;
        if(existing.length){
          if(existing.length!==1||existing[0].id!==c.id||existing[0].definition_hash!==hash||existing[0].title!==c.title)throw Error("profile_version_conflict");
          return {id:c.id,duplicate:true};
        }
        await db.query(`INSERT INTO karda_kb.compile_profile_version(id,kb_id,title,schema_id,schema_version,definition_hash,definition,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[c.id,kbId,c.title,s.schemaId,s.version,hash,JSON.stringify(c.definition),who.sub]);
        return {id:c.id,duplicate:false};
      }
      const prior=(await db.query<{fingerprint:string;revision:number}>("SELECT fingerprint,revision FROM karda_kb.compile_profile_activation WHERE kb_id=$1 AND event_id=$2",[kbId,c.eventId])).rows[0];
      const fingerprint=profileHash(c);
      if(prior){if(prior.fingerprint!==fingerprint)throw Error("profile_conflict");return {revision:prior.revision,duplicate:true};}
      const latest=(await db.query<{revision:number}>("SELECT revision FROM karda_kb.compile_profile_activation WHERE kb_id=$1 ORDER BY revision DESC LIMIT 1",[kbId])).rows[0];
      if((latest?.revision??0)!==c.expectedRevision)throw Error("profile_conflict");
      let definition=localCompileProfile();
      if(c.profileId){const row=(await db.query<ProfileVersion>("SELECT * FROM karda_kb.compile_profile_version WHERE kb_id=$1 AND id=$2",[kbId,c.profileId])).rows[0];
        if(!row||profileHash(row.definition)!==row.definition_hash)throw Error("profile_version_conflict");definition=row.definition;}
      if((await this.unmapped(db,kbId,definition)).length)throw Error("profile_entity_kind_unmapped");
      const revision=c.expectedRevision+1;
      await db.query(`INSERT INTO karda_kb.compile_profile_activation(kb_id,revision,event_id,profile_id,fingerprint,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[kbId,revision,c.eventId,c.profileId,fingerprint,c.note,who.sub]);
      return {revision,duplicate:false};
    });
  }
}
