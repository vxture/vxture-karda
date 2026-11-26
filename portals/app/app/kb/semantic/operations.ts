export const OPERATION_STATES=["open","in_progress","blocked","resolved","dismissed"] as const;
export const OPERATION_PRIORITIES=["low","normal","high","urgent"] as const;
export type OperationState=typeof OPERATION_STATES[number];
export type OperationPriority=typeof OPERATION_PRIORITIES[number];
export interface OperationFields {title:string;state:OperationState;priority:OperationPriority;dueDate:string|null}
export type OperationCommand={action:"create";eventId:string;taskId:string;kbId:string;targetType:"library"|"document"|"relation";targetId:string;note:string}&OperationFields|
  {action:"update";eventId:string;taskId:string;expectedRevision:number;note:string}&OperationFields;
export interface OperationRow extends OperationFields {taskId:string;kbId:string;libraryName:string;targetType:string;targetId:string;
  revision:number;note:string;actor:string;createdAt:string}
export interface OperationsResult {format:"karda.operations.v1";tasks:OperationRow[];history:OperationRow[];nextBefore:string|null;nextHistoryBefore:number|null;checkedAt:string}
export const OPERATION_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const bad=():never=>{throw Error("operations_invalid_request");};
export function parseOperationCommand(text:string):OperationCommand{
  if(text.length>20000)bad();let v:Record<string,unknown>;
  try{v=JSON.parse(text);}catch{return bad();}
  if(!v||typeof v!=="object"||Array.isArray(v))bad();
  const common=["action","eventId","taskId","title","state","priority","dueDate","note"],
    fields=v.action==="create"?[...common,"kbId","targetType","targetId"]:v.action==="update"?[...common,"expectedRevision"]:bad();
  if(Object.keys(v).sort().join()!==fields.sort().join()||!OPERATION_UUID.test(String(v.eventId))||!OPERATION_UUID.test(String(v.taskId))||
    typeof v.title!=="string"||!v.title.trim()||v.title.length>200||typeof v.note!=="string"||!v.note.trim()||v.note.length>10000||
    !OPERATION_STATES.includes(v.state as OperationState)||!OPERATION_PRIORITIES.includes(v.priority as OperationPriority))bad();
  if(v.dueDate!==null&&(typeof v.dueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)||
    !Number.isFinite(Date.parse(v.dueDate))||new Date(v.dueDate).toISOString().slice(0,10)!==v.dueDate))bad();
  if(v.action==="create"){
    if(v.state!=="open"||!OPERATION_UUID.test(String(v.kbId))||!OPERATION_UUID.test(String(v.targetId))||
      !["library","document","relation"].includes(String(v.targetType))||(v.targetType==="library"&&v.targetId!==v.kbId))bad();
  }else if(!Number.isSafeInteger(v.expectedRevision)||(v.expectedRevision as number)<1||(v.expectedRevision as number)>=2147483647)bad();
  return v as unknown as OperationCommand;
}
export interface OperationsQuery {kbId?:string;taskId?:string;state?:OperationState;priority?:OperationPriority;before?:string;overdue?:boolean;historyBefore?:number}
export function parseOperationsQuery(params:URLSearchParams):OperationsQuery{
  if([...params.keys()].some(k=>!["kbId","taskId","state","priority","before","overdue","historyBefore"].includes(k))||
    [...params.keys()].some(k=>params.getAll(k).length!==1))bad();
  const v=Object.fromEntries(params);
  for(const key of ["kbId","taskId","before"])if(v[key]!==undefined&&!OPERATION_UUID.test(v[key]))bad();
  if(v.state!==undefined&&!OPERATION_STATES.includes(v.state as OperationState))bad();
  if(v.priority!==undefined&&!OPERATION_PRIORITIES.includes(v.priority as OperationPriority))bad();
  if(v.overdue!==undefined&&v.overdue!=="true")bad();
  if(v.taskId&&Object.keys(v).some(k=>k!=="taskId"&&k!=="historyBefore"))bad();
  if(v.historyBefore!==undefined&&(!v.taskId||!/^\d{1,10}$/.test(v.historyBefore)||Number(v.historyBefore)<1||Number(v.historyBefore)>2147483647))bad();
  return {...v,...(v.overdue?{overdue:true}:{}),...(v.historyBefore?{historyBefore:Number(v.historyBefore)}:{})} as OperationsQuery;
}
export function operationTransition(from:OperationState,to:OperationState):boolean{
  // Closing a work item never accepts assertions or publishes a release.
  const terminal=(s:OperationState)=>s==="resolved"||s==="dismissed";
  return from===to||(!terminal(from)&&!terminal(to))||(!terminal(from)&&terminal(to))||(terminal(from)&&to==="open");
}
