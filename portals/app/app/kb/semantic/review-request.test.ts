import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseReviewRequest, reviewOriginAllowed } from "./review-request";

test("review protocol refuses identity/payload injection and coerced revisions", () => {
  const review = {action:"review",runId:randomUUID(),relationId:randomUUID(),expectedRevision:0,decision:"accept",note:"Checked support"};
  assert.deepEqual(parseReviewRequest(JSON.stringify(review)),review);
  for (const extra of [{sub:"another"},{payload:{}},{workspaceId:randomUUID()},{expectedRevision:"0"},{expectedRevision:null},
    {decision:"approve"},{note:" "},{runId:"bad"}])
    assert.throws(()=>parseReviewRequest(JSON.stringify({...review,...extra})),/semantic_invalid_request/);
  for (const text of ["null","[]","{}","broken",JSON.stringify({...review,note:"a".repeat(20000)})])
    assert.throws(()=>parseReviewRequest(text),/semantic_invalid_request/);
});

test("publication HTTP carries only the bound preview token", () => {
  const preview = {action:"preview",runId:randomUUID(),eventId:randomUUID()};
  assert.deepEqual(parseReviewRequest(JSON.stringify(preview)),preview);
  const publish = {...preview,action:"publish",expectedGeneration:0,fingerprint:"a".repeat(64)};
  assert.deepEqual(parseReviewRequest(JSON.stringify(publish)),publish);
  for (const patch of [{payload:{}},{fingerprint:"bad"},{expectedGeneration:-1},{expectedGeneration:"0"},{eventId:"bad"}])
    assert.throws(()=>parseReviewRequest(JSON.stringify({...publish,...patch})),/semantic_invalid_request/);
});

test("review mutations require configured same origin even with cookies", () => {
  const request=(origin?:string,site?:string)=>new Request("https://karda.example/api/kb/id/semantic",{
    headers:{cookie:"session=opaque",...(origin?{origin}:{}),...(site?{"sec-fetch-site":site}:{})}});
  assert.equal(reviewOriginAllowed(request("https://karda.example","same-origin"),"https://karda.example"),true);
  assert.equal(reviewOriginAllowed(request(),"https://karda.example"),false);
  assert.equal(reviewOriginAllowed(request("https://other.example"),"https://karda.example"),false);
  assert.equal(reviewOriginAllowed(request("https://karda.example","cross-site"),"https://karda.example"),false);
  assert.equal(reviewOriginAllowed(request(),""),false);
});
