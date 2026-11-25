export const COMPILE_TASK_STATES=["queued","running","completed","needs_review","failed","suspended"] as const;
export interface CompileTaskQuery {before?:string;state?:string;taskId?:string}
export function parseCompileTaskQuery(params:URLSearchParams):CompileTaskQuery{
  const bad=():never=>{throw new Error("semantic_invalid_task_request");};
  if([...params.keys()].some(k=>!["before","state","taskId"].includes(k))||[...new Set(params.keys())].some(k=>params.getAll(k).length!==1))return bad();
  const query=Object.fromEntries(params) as CompileTaskQuery;
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if((query.before!==undefined&&!uuid.test(query.before))||(query.taskId!==undefined&&!uuid.test(query.taskId))||
    (query.state!==undefined&&!(COMPILE_TASK_STATES as readonly string[]).includes(query.state))||
    (query.taskId&&(query.before||query.state)))return bad();
  return query;
}
