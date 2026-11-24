import type { CompilerSnapshot } from "./compiler";

/** Local bootstrap vocabulary, explicitly separate from an Ontos publication. */
export function localCompileProfile(): Pick<CompilerSnapshot,"schema"|"entityTypes"> {
  return {schema:{namespace:"karda.local",schemaId:"general-relations",version:"1",entityTypes:["entity"],
    relationTypes:["requires","supports","part_of","applies_to"].map(id=>({id,sourceTypes:["entity"],targetTypes:["entity"]}))},
    entityTypes:["thing","person","organization","org","system","concept","term","requirement","rule","procedure",
      "event","product","document","location"].map(kind=>({kind,type:"entity"}))};
}
