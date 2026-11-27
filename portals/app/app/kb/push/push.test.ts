import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parse,endpoint,EVENT_TYPES,pushFailure} from './contract';
import {seal,unseal,newSigningKey,signature,verifySignature} from './crypto';
import {resolveEndpoint,publicAddress} from './transport';
import {retryDelay} from './worker';
const id=randomUUID(),serviceId=randomUUID(),master='synthetic-envelope-master-0000000';
test('push strict contracts refuse ambiguous scopes, unsafe endpoint syntax and unbounded commands',()=>{
 assert.equal(endpoint('https://receiver.example.com/karda-events'),'https://receiver.example.com/karda-events');
 for(const u of ['http://receiver.example.com','https://localhost/x','https://127.0.0.1/x','https://2130706433/x','https://[::1]/x','https://receiver.example.com:8443/x','https://user:pass@receiver.example.com','https://receiver.example.com/#frag','https://receiver.example.com/?token=private'])assert.throws(()=>endpoint(u),u);
 const c={action:'create',id,config:{name:'Receiver',url:'https://receiver.example.com/karda-events',serviceId,eventTypes:[...EVENT_TYPES]},note:'Create scoped receiver'};assert.equal(parse(c).action,'create');assert.throws(()=>parse({...c,role:'owner'}));assert.throws(()=>parse({...c,config:{...c.config,eventTypes:[EVENT_TYPES[0],EVENT_TYPES[0]]}}));assert.throws(()=>parse({action:'replay',id,eventId:id,expectedRevision:1,note:'Replay',ids:Array.from({length:51},()=>randomUUID())}));assert.equal(pushFailure(Error('private network or SQL details')).code,'push_unavailable');
});
test('push signing uses raw bytes, timestamp and delivery identity; key envelopes bind consumer and key identity',()=>{
 const secret=newSigningKey(),keyId=randomUUID(),raw=Buffer.from('{"eventId":"'+id+'","message":"Unicode: \u4e2d"}'),timestamp='1795740000',signed=signature(secret,timestamp,id,raw);assert.equal(verifySignature(secret,timestamp,id,raw,signed,1795740000),true);assert.equal(verifySignature(secret,timestamp,id,Buffer.from(raw.toString()+' '),signed,1795740000),false);assert.equal(verifySignature(secret,timestamp,randomUUID(),raw,signed,1795740000),false);assert.equal(verifySignature(secret,timestamp,id,raw,signed,1795740400),false);
 const encrypted=seal(secret,id,keyId,master);assert.ok(!encrypted.includes(secret));assert.equal(unseal(encrypted,id,keyId,master),secret);assert.throws(()=>unseal(encrypted,randomUUID(),keyId,master),/push_key_unavailable/);assert.throws(()=>unseal(encrypted,id,keyId,master+'changed'),/push_key_unavailable/);assert.throws(()=>seal(secret,id,keyId,''),/push_key_unavailable/);
});
test('push transport rejects all private/special/mapped DNS addresses and pins verified public resolution',async()=>{
 for(const ip of ['0.0.0.0','10.1.1.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1'])assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicAddress(ip),true,ip);
 const resolver=async()=>[{address:'8.8.8.8',family:4}];const pinned=await resolveEndpoint('https://receiver.example.com/events',resolver as any);assert.equal(pinned.address,'8.8.8.8');assert.equal(pinned.url.hostname,'receiver.example.com');await assert.rejects(resolveEndpoint('https://receiver.example.com',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}] as any),/push_endpoint_denied/);
 assert.equal(retryDelay(1),30000);assert.equal(retryDelay(2),60000);
});
test('push DDL includes transactional capture, immutable events and state-only grants in all mirrors',()=>{
 const base=new URL('../../../../../deploy/database/ddl/',import.meta.url),sql=readFileSync(new URL('incr/0042_knowledge_push.sql',base),'utf8');for(const [section,file] of [['KNOWLEDGE PUSH','00_baseline.sql'],['KNOWLEDGE PUSH TRIGGERS','00_baseline.sql'],['KNOWLEDGE PUSH LOCKS','98_column_locks.sql']]){const text=readFileSync(new URL(file,base),'utf8'),start='-- BEGIN '+section,end='-- END '+section;assert.equal(sql.slice(sql.indexOf(start),sql.indexOf(end)+end.length),text.slice(text.indexOf(start),text.indexOf(end)+end.length));}assert.match(sql,/AFTER INSERT ON karda_kb.semantic_release/);assert.match(sql,/REVOKE UPDATE,DELETE/);assert.ok(sql.includes('UNIQUE(consumer_id,event_id)'));
 const wire=readFileSync(new URL('./transport.ts',import.meta.url),'utf8');assert.match(wire,/rejectUnauthorized:true/);assert.match(wire,/lookup:/);assert.match(wire,/agent:false/);
 const example=readFileSync(new URL('../../../../../scripts/knowledge/push-receiver-example.mjs',import.meta.url),'utf8'),download=readFileSync(new URL('../../../public/integrations/karda-push-receiver.mjs',import.meta.url),'utf8');assert.equal(example,download);
});
