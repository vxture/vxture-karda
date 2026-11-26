/** Explicit scope, normalized once; an empty selection never means all sources. */
export function compileSourceSelection(value:unknown):string[]{
  if(!Array.isArray(value)||!value.length||value.length>100||value.some(id=>typeof id!=="string"||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))||new Set(value).size!==value.length)
    throw new Error("semantic_invalid_source_selection");
  return [...value].sort();
}
