import {createHash} from 'node:crypto';
function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
