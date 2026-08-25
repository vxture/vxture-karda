import { BRAND } from "@karda/shared/brand";
import { EvalSetsClient } from "./sets-client";

export const metadata = { title: `评测集 - ${BRAND.displayName}` };

// Authoring and running the question sets behind 质量评测. KD-011 ruled out
// synthetic QA generation for v1, so every question is written by a person.
export default function EvalSetsPage() {
  return <EvalSetsClient />;
}
