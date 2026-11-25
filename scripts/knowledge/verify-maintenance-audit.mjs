import {readFileSync,statSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

/** Offline integrity check only. Anyone can recompute a digest; this is not authentication. */
export function verifyMaintenanceAudit(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("audit_invalid");
  const {digest,digestAlgorithm,...body}=value;
  if(body.format!=="karda.maintenance-audit.v1"||body.scope!=="current_authorized_diagnostic"||
    typeof body.kbId!=="string"||!body.kbId||!Number.isSafeInteger(body.generation)||body.generation<0||
    !Number.isFinite(Date.parse(body.checkedAt))||digestAlgorithm!=="sha256-json-body-v1"||typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)||
    !Array.isArray(body.sources)||body.sources.length>100||!Array.isArray(body.relations)||body.relations.length>5000||
    new Set(body.sources.map(r=>r?.id)).size!==body.sources.length||new Set(body.relations.map(r=>r?.id)).size!==body.relations.length)
    throw Error("audit_invalid");
  for(const row of [...body.sources,...body.relations])if(!row||typeof row.id!=="string"||!row.id||!Array.isArray(row.issues)||!row.issues.every(i=>typeof i==="string"))throw Error("audit_invalid");
  if(createHash("sha256").update(JSON.stringify(body)).digest("hex")!==digest)throw Error("audit_digest_mismatch");
  return value;
}

export function compareMaintenanceAudits(left,right){
  verifyMaintenanceAudit(left);verifyMaintenanceAudit(right);
  if(left.kbId!==right.kbId||Date.parse(left.checkedAt)>=Date.parse(right.checkedAt)||left.generation>right.generation)throw Error("audit_incompatible_comparison");
  const compare=(before,after)=>{
    const a=new Map(before.map(r=>[r.id,r])),b=new Map(after.map(r=>[r.id,r]));
    return {added:[...b.keys()].filter(id=>!a.has(id)).sort(),removed:[...a.keys()].filter(id=>!b.has(id)).sort(),
      changed:[...b.keys()].filter(id=>a.has(id)&&JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))).sort(),
      findings:[...b.keys()].filter(id=>a.has(id)).sort().flatMap(id=>{
        const old=new Set(a.get(id).issues),current=new Set(b.get(id).issues),appeared=[...current].filter(v=>!old.has(v)).sort(),cleared=[...old].filter(v=>!current.has(v)).sort();
        return appeared.length||cleared.length?[{id,appeared,cleared}]:[];
      })};
  };
  return {format:"karda.maintenance-audit-comparison.v1",scope:"historical_diagnostics_only",kbId:left.kbId,
    before:{digest:left.digest,checkedAt:left.checkedAt,generation:left.generation},after:{digest:right.digest,checkedAt:right.checkedAt,generation:right.generation},
    sources:compare(left.sources,right.sources),relations:compare(left.relations,right.relations)};
}

function read(path){if(statSync(path).size>2*1024*1024+1024)throw Error("audit_size_limit");const data=readFileSync(path);if(data.length>2*1024*1024+1024)throw Error("audit_size_limit");return verifyMaintenanceAudit(JSON.parse(data.toString("utf8").replace(/^\uFEFF/,"")));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const args=process.argv.slice(2);if(args.length<1||args.length>2)throw Error("usage: node scripts/knowledge/verify-maintenance-audit.mjs audit.json [newer-audit.json]");
    const first=read(args[0]);
    process.stdout.write(JSON.stringify(args.length===2?compareMaintenanceAudits(first,read(args[1])):{integrity:"matched",authenticated:false,kbId:first.kbId,digest:first.digest,checkedAt:first.checkedAt},null,2)+"\n");
  }catch(error){process.stderr.write((error instanceof Error?error.message:"audit_invalid")+"\n");process.exitCode=1;}
}
