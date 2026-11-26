export interface SourceInspectionQuery {before?:string;documentId?:string}
export function parseSourceInspectionQuery(params:URLSearchParams):SourceInspectionQuery{
  const bad=():never=>{throw new Error("semantic_invalid_source_query");};
  if([...params.keys()].some(k=>!["view","before","documentId"].includes(k))||
    [...new Set(params.keys())].some(k=>params.getAll(k).length!==1)||params.get("view")!=="sources")return bad();
  const before=params.get("before"),documentId=params.get("documentId"),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if((before!==null&&!uuid.test(before))||(documentId!==null&&!uuid.test(documentId))||(before!==null&&documentId!==null))return bad();
  return {...(before?{before}:{}),...(documentId?{documentId}:{})};
}
