import { pageTitle } from "../../../../_i18n/server-locale";
import { semantic } from "../../../../_i18n/messages/semantic";
import { SemanticReviewClient } from "./review-client";

export async function generateMetadata() { return pageTitle(semantic.title); }
export default async function SemanticReviewPage({params}:{params:Promise<{kbId:string}>}) {
  const {kbId}=await params;
  return <SemanticReviewClient key={kbId} kbId={kbId} />;
}
