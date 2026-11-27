import {getPrismaClient,prismaEnabled} from "../../../lib/db";
import {NextResponse} from "next/server";
import {requireAuth} from "../../../kb/api/http";
import {KbService} from "../../../kb/lib/service";
import {getKbStore} from "../../../kb/lib/store";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const auth=await requireAuth("data.read");if(!auth.ok)return auth.response;
 const q=new URL(req.url).searchParams.get("q")?.trim().slice(0,200).toLocaleLowerCase()??"";
 try{const rows=await new KbService(getKbStore()).list(auth.user.activeWorkspace);
 const visible=rows.filter(k=>k.ownerType==="user"&&(k.ownerSub===auth.user.sub||["ws_published","org_published"].includes(k.publishState)));
 const items=visible.filter(k=>!q||[k.name,k.description??""].some(v=>v.toLocaleLowerCase().includes(q))).slice(0,20).map(k=>({id:k.id,name:k.name,href:"/assets/"+k.id}));
 if(q&&items.length<20&&prismaEnabled()){const p=await getPrismaClient();const docs=await p.document.findMany({where:{kbId:{in:visible.map(k=>k.id)},contentState:{notIn:["deleted","archived"]},title:{contains:q,mode:"insensitive"}},orderBy:{updatedAt:"desc"},take:20-items.length,select:{id:true,kbId:true,title:true}});items.push(...docs.map(d=>({id:d.id,name:d.title??d.id,href:"/assets/"+d.kbId+"?documentId="+d.id})));}
 return NextResponse.json({items},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"search_unavailable"},{status:503});}
}
