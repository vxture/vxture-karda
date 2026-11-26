export const WORK_KINDS=["processing","compilation","ocr","maintenance"] as const;
export const WORK_STATES=["queued","running","attention","completed","closed"] as const;
export type WorkKind=typeof WORK_KINDS[number];
export type WorkState=typeof WORK_STATES[number];
export interface WorkQuery {kbId?:string;kind?:WorkKind;state?:WorkState;before?:string}
export interface WorkItem {id:string;kind:WorkKind;kbId:string;libraryName:string;title:string;state:WorkState;rawState:string;
  stage:string|null;attempt:number|null;documentId:string|null;createdAt:string;updatedAt:string;href:string}
export interface WorkCenter {format:"karda.work-center.v1";checkedAt:string;items:WorkItem[];nextBefore:string|null;
  libraries:{id:string;name:string}[];counts:{kind:WorkKind;state:WorkState;count:number}[]}
export const WORK_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parseWorkQuery(params:URLSearchParams):WorkQuery{
  const bad=():never=>{throw Error("work_invalid_request");};
  if([...params.keys()].some(k=>!["kbId","kind","state","before"].includes(k))||[...params.keys()].some(k=>params.getAll(k).length!==1))bad();
  const value=Object.fromEntries(params);
  if(value.kbId!==undefined&&!WORK_UUID.test(value.kbId))bad();
  if(value.kind!==undefined&&!(WORK_KINDS as readonly string[]).includes(value.kind))bad();
  if(value.state!==undefined&&!(WORK_STATES as readonly string[]).includes(value.state))bad();
  if(value.before!==undefined&&(!/^[A-Za-z0-9_-]{1,1024}$/.test(value.before)))bad();
  return value as WorkQuery;
}
export function workHref(item:Pick<WorkItem,"id"|"kind"|"kbId"|"documentId">):string{
  if(!WORK_UUID.test(item.id)||!WORK_UUID.test(item.kbId)||!(WORK_KINDS as readonly string[]).includes(item.kind))throw Error("work_invalid_item");
  const kb=`/assets/${item.kbId}`;
  if(item.kind==="processing")return `/pipeline/tasks/${item.id}`;
  if(item.kind==="compilation")return `${kb}/semantic?taskId=${item.id}`;
  if(item.kind==="maintenance")return `/pipeline/operations?taskId=${item.id}`;
  if(!item.documentId||!WORK_UUID.test(item.documentId))throw Error("work_invalid_item");
  return `${kb}/ocr?documentId=${item.documentId}&draftId=${item.id}`;
}
