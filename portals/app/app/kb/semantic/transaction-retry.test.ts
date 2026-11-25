import test from "node:test";
import assert from "node:assert/strict";
import {retrySemanticTransaction} from "./transaction-retry";

test("deadlock retry re-enters the complete rolled-back attempt and is bounded; semantic conflicts are not retried",async()=>{
  let attempts=0,rolledBack=0,released=0;
  const value=await retrySemanticTransaction(async()=>{attempts++;
    try{if(attempts<3)throw Object.assign(new Error("deadlock"),{code:"40P01"});return "committed";}
    catch(e){rolledBack++;throw e;}finally{released++;}});
  assert.equal(value,"committed");assert.equal(attempts,3);assert.equal(rolledBack,2);assert.equal(released,3);
  attempts=0;await assert.rejects(retrySemanticTransaction(async()=>{attempts++;throw Object.assign(new Error("deadlock"),{code:"40P01"});}),/deadlock/);assert.equal(attempts,3);
  for(const code of ["23505","42501","40001","semantic_selection_conflict"]){attempts=0;
    await assert.rejects(retrySemanticTransaction(async()=>{attempts++;throw Object.assign(new Error("no retry"),{code});}),/no retry/);assert.equal(attempts,1);}
});
