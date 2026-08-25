import { BRAND } from "@karda/shared/brand";
import { NewAssetClient } from "./new-client";

export const metadata = { title: `新建资产 - ${BRAND.displayName}` };

// Creating a library IS the classification step: a document is classified by
// which library it goes into, and each library carries its own sharing grade.
// So this is a first-class product surface, not a settings form.
export default function NewAssetPage() {
  return <NewAssetClient />;
}
