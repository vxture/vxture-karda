import { pageTitle } from "../../../_i18n/server-locale";
import { shell } from "../../../_i18n/messages/shell";
import { EvalSetsClient } from "./sets-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export async function generateMetadata() {
  return pageTitle(shell.subSets);
}

// Authoring and running the question sets behind 质量评测. KD-011 ruled out
// synthetic QA generation for v1, so every question is written by a person.
export default function EvalSetsPage() {
  return <EvalSetsClient />;
}
