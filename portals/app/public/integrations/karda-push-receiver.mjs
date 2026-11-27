// Standalone integration example. Run only on an operator-selected HTTPS ingress.
// node scripts/knowledge/push-receiver-example.mjs; ingress must preserve raw bytes.
// Requires KARDA_PUSH_SECRET, KARDA_PUSH_KEY_ID, KARDA_PUSH_CONSUMER_ID.
// Local HTTP binding is loopback only; publish through your own HTTPS ingress.
import {createServer} from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const secret=process.env.KARDA_PUSH_SECRET,keyId=process.env.KARDA_PUSH_KEY_ID,consumerId=process.env.KARDA_PUSH_CONSUMER_ID;
if(!/^[A-Za-z0-9_-]{43}$/.test(secret??'')||!keyId||!consumerId)throw Error('Configure current signing key and consumer identity before starting');
const dir=resolve(process.env.KARDA_PUSH_RECEIPT_DIR??'.karda-push-receipts');await mkdir(dir,{recursive:true});
const port=Number(process.env.PORT??8788);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PORT');
createServer(async(req,res)=>{
 const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(req.method!=='POST'||req.url!=='/karda-events')return reply(404,{accepted:false});
 try{
  const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>16384)return reply(413,{accepted:false});chunks.push(b);}const body=Buffer.concat(chunks);
  const stamp=req.headers['x-karda-timestamp'],delivery=req.headers['x-karda-delivery-id'],provided=req.headers['x-karda-signature'];
  if(req.headers['x-karda-key-id']!==keyId||typeof stamp!=='string'||!/^[0-9]{10}$/.test(stamp)||Math.abs(Math.floor(Date.now()/1000)-Number(stamp))>300||typeof delivery!=='string'||typeof provided!=='string'||!/^v1=[a-f0-9]{64}$/.test(provided))return reply(401,{accepted:false});
  const expected='v1='+createHmac('sha256',secret).update(stamp+'.'+delivery+'.').update(body).digest('hex');if(!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return reply(401,{accepted:false});
  const event=JSON.parse(body.toString('utf8'));
  if(event.format!=='karda.knowledge-event.v1'||event.consumerId!==consumerId||event.deliveryId!==delivery||event.eventId!==req.headers['x-karda-event-id']||event.requestId!==req.headers['x-karda-request-id']||typeof event.eventId!=='string'||!/^[a-f0-9-]{36}$/.test(event.eventId))return reply(400,{accepted:false});
  // Persist acceptance before ACK. This is only an inbox; enqueue your own work
  // transactionally here. Re-read current knowledge with an OBO identity, never
  // treat the event as a knowledge body or grant. Events can be duplicated or
  // arrive out of order. Never log the signing secret or assume first delivery.
  const target=join(dir,event.eventId+'.json');let exists=false;try{const old=JSON.parse(await readFile(target,'utf8'));exists=old.eventId===event.eventId;}catch{}if(!exists){const tmp=join(dir,event.requestId+'.tmp');await writeFile(tmp,JSON.stringify(event),{mode:0o600});await rename(tmp,target);}
  return reply(200,{eventId:event.eventId,accepted:true});
 }catch{return reply(503,{accepted:false});}
}).listen(port,'127.0.0.1',()=>process.stdout.write('Example inbox ready behind your HTTPS ingress\n'));
