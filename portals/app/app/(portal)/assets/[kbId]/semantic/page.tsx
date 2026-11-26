import { pageTitle } from "../../../../_i18n/server-locale";
import { semantic } from "../../../../_i18n/messages/semantic";
import { SemanticReviewClient } from "./review-client";

export async function generateMetadata() { return pageTitle(semantic.title); }
export default async function SemanticReviewPage({params,searchParams}:{params:Promise<{kbId:string}>;searchParams:Promise<{taskId?:string}>}) {
  const {kbId}=await params,query=await searchParams;
  return <SemanticReviewClient key={`${kbId}/${query.taskId??""}`} kbId={kbId} initialTaskId={query.taskId} />;
}
