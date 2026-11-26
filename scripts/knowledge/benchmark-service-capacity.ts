// Run from the app workspace with tsx. Requires a dedicated local control database.
import {resolve} from "node:path";
import {benchmarkKnowledgeCapacity} from "../../portals/app/app/kb/semantic/capacity-benchmark";
import {writeReproducibleArtifact} from "./artifact-output";
const args=process.argv.slice(2);
if(args.length<1||args.length>2||!process.env.KARDA_SCALE_DATABASE_URL)throw Error("usage: KARDA_SCALE_DATABASE_URL=local-control tsx benchmark-service-capacity.ts new-report.json [samples2-30]");
async function main(){
const report=await benchmarkKnowledgeCapacity(process.env.KARDA_SCALE_DATABASE_URL,args[1]===undefined?10:Number(args[1]));
writeReproducibleArtifact(resolve(args[0]),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({format:report.format,cases:report.cases.map(c=>({label:c.label,covered:c.coveredRelations,directoryP95:c.directory.map(r=>r.p95Ms),factsP95:c.facts.map(r=>r.p95Ms)})),checks:report.checks}));

}
main().catch(error=>{console.error(error instanceof Error?error.message:"capacity_failed");process.exitCode=1;});
