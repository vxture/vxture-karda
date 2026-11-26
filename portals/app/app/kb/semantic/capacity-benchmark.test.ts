import test from "node:test";
import assert from "node:assert/strict";
import {capacityControlUrl,capacityStats} from "./capacity-benchmark";
test("capacity runner accepts only a dedicated loopback control database",()=>{
  assert.equal(capacityControlUrl("postgresql://postgres@127.0.0.1:5547/karda_scale_control").pathname,"/karda_scale_control");
  for(const value of ["postgresql://postgres@example.org/karda_scale_control","postgresql://postgres@127.0.0.1/karda_p3_test","postgresql://postgres@127.0.0.1/postgres","postgresql://postgres@127.0.0.1/karda_scale_control?host=remote","https://127.0.0.1/karda_scale_control"])
    assert.throws(()=>capacityControlUrl(value),/isolated_capacity_control_required/);
});
test("capacity percentiles preserve raw samples and use nearest rank",()=>{
  const values=Array.from({length:20},(_,i)=>20-i),result=capacityStats(values);
  assert.equal(result.p50Ms,10);assert.equal(result.p95Ms,19);assert.equal(result.maxMs,20);assert.deepEqual(values,result.samplesMs);
  for(const bad of [[],[-1],[NaN],[Infinity]])assert.throws(()=>capacityStats(bad),/invalid_capacity_samples/);
});
