import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {evaluateDraftLexical, type EvaluationCorpus, type DraftDataset} from "../../portals/app/app/kb/semantic/evaluation";

const root = resolve(import.meta.dirname,"corpus");
const corpus = JSON.parse(readFileSync(resolve(root,"procurement-regulations-2015.json"),"utf8")) as EvaluationCorpus;
const dataset = JSON.parse(readFileSync(resolve(root,"procurement-draft-cases.json"),"utf8")) as DraftDataset;
console.log(JSON.stringify(evaluateDraftLexical(corpus,dataset),null,2));
