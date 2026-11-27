import type {Pool} from 'pg';
import type {SemanticReadIdentity} from '../semantic/read-postgres';
import {PostgresSemanticReader} from '../semantic/read-postgres';
import {PostgresFormalSemanticLoader} from '../semantic/store-postgres';
import {getObjectStore} from '../storage/objectstore';
import {queryIndex} from './client';
import type {ViewConfig} from './contract';
/** Resolve saved intent over the full current eligible graph, not the first page.
 * Output remains bounded; unavailable members are reported by restoreView. */
export async function presentationPackage(pool:Pool,who:SemanticReadIdentity,kbId:string,config:ViewConfig,admit:()=>Promise<boolean>,exporting=false){
 const nodeIds=[...new Set([...config.nodeIds,...config.steps.flatMap(s=>s.nodeIds),...config.groups.flatMap(g=>g.nodeIds),...(config.focus?[config.focus]:[])])];
 const edgeIds=[...new Set([...config.edgeIds,...config.steps.flatMap(s=>s.edgeIds)])];
 const loader=new PostgresFormalSemanticLoader();
 const reader=new PostgresSemanticReader(pool,getObjectStore(),admit,(db,ids)=>loader.load(db,ids),undefined,(graph,schema,query,directory,db)=>queryIndex(who,[kbId],graph,schema,query,directory,db,nodeIds.length||edgeIds.length?{nodeIds,edgeIds}:undefined));
 return reader.readPackage(who,[kbId],{seedIds:['directory'],maxHops:0,maxNodes:500,maxEdges:1000,relationTypes:config.relationTypes.length?config.relationTypes:undefined},true,exporting);
}
