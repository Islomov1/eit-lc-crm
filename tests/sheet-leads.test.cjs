const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const {PrismaClient} = require('@prisma/client');
const crypto = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw Error('Local test database required');
const p = new PrismaClient();
const load = require('./load-ts.cjs')({'@/lib/prisma': {prisma:p}});
const {normalizeSheetLead, importSheetLead, sheetLeadId} = load('src/lib/sheet-leads.ts');
const route = load('src/app/api/leads/sheets/route.ts');
const sheet = 'test-sheet-' + crypto.randomUUID();
const ids=[];
const base = {request_id:crypto.randomUUID(),name:'Example learner',phone:901234567,created_at:'2026-09-24T08:16:48.322Z',course:'ielts',schedule:'morning',locale:'ru',source:'/ru/home',consent:'yes',utm_source:'instagram'};
after(async()=>{if(ids.length){await p.leadActivity.deleteMany({where:{leadId:{in:ids}}});await p.auditLog.deleteMany({where:{entity:'Lead',entityId:{in:ids}}});await p.lead.deleteMany({where:{id:{in:ids}}});}await p.$disconnect();});
test('preserves original date, campaign and placement result, normalizes numeric phones and sets ONLINE',()=>{
 const a=normalizeSheetLead(sheet,base).data;assert.equal(a.phone,'+998901234567');assert.equal(a.program,'IELTS');assert.equal(a.learningFormat,'ONLINE');assert.equal(a.createdAt.toISOString(),base.created_at);assert.match(a.note,/Утро/);assert.match(a.note,/utm_source: instagram/);
 const b=normalizeSheetLead(sheet,{...base,phone:"'+998901234567",source:'placement | English | A1 | 5/66'}).data;assert.equal(b.source,'placement');assert.match(b.note,/A1 \| 5\/66/);assert.equal(a.id,b.id);assert.notEqual(sheetLeadId(sheet+'2',base.request_id),a.id);
});
test('explicit test records never become clients; ordinary names are retained',()=>{
 for(const extra of [{name:'Тест EIT — дизайн 25.09',phone:0},{name:'Test User'},{source:'docker-smoke'},{request_id:'eit-local-verify-1790942109734'},{source:'local-verify | do-not-call'}])assert.equal(normalizeSheetLead(sheet,{...base,...extra}).skipped,true);
 for(const name of ['Tokhir','Саша каша','Diyor','Odina'])assert.equal(normalizeSheetLead(sheet,{...base,name}).skipped,false);
 for(const extra of [{consent:'no'},{phone:0},{phone:{x:1}},{created_at:'10/04/2026'},{request_id:'short'}])assert.throws(()=>normalizeSheetLead(sheet,{...base,...extra}));
});
test('concurrent sync retries create one lead and preserve subsequent CRM decisions',async()=>{
 const id=sheetLeadId(sheet,base.request_id);ids.push(id);
 const results=await Promise.all(Array.from({length:5},()=>importSheetLead(sheet,base)));assert.equal(results.filter(r=>r.status==='imported').length,1);assert.equal(await p.lead.count({where:{id}}),1);assert.equal(await p.leadActivity.count({where:{leadId:id}}),1);
 await p.lead.update({where:{id},data:{status:'ACTIVE',ownerId:'test-owner',learningFormat:'OFFLINE',archivedAt:new Date()}});
 const again=await importSheetLead(sheet,{...base,name:'changed upstream'});assert.equal(again.status,'existing');const saved=await p.lead.findUnique({where:{id}});assert.equal(saved.name,base.name);assert.equal(saved.status,'ACTIVE');assert.equal(saved.ownerId,'test-owner');assert.equal(saved.learningFormat,'OFFLINE');assert.ok(saved.archivedAt);
});
test('endpoint rejects unauthorized or foreign sheet data, bounds payloads, and isolates invalid rows',async()=>{
 const oldSecret=process.env.SHEETS_CRM_SECRET, oldSheet=process.env.EIT_LEADS_SPREADSHEET_ID;process.env.SHEETS_CRM_SECRET='local-test-secret';process.env.EIT_LEADS_SPREADSHEET_ID=sheet;
 function req(body,token='local-test-secret'){return new Request('https://example.test/api/leads/sheets',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});}
 try{assert.equal((await route.POST(req({spreadsheetId:sheet,rows:[base]},'wrong'))).status,401);assert.equal((await route.POST(req({spreadsheetId:'foreign',rows:[base]}))).status,400);assert.equal((await route.POST(req({spreadsheetId:sheet,rows:Array(26).fill(base)}))).status,400);assert.equal((await route.POST(req({x:'a'.repeat(128001)}))).status,413);
 const row={...base,request_id:crypto.randomUUID()};ids.push(sheetLeadId(sheet,row.request_id));const response=await route.POST(req({spreadsheetId:sheet,rows:[{...row,request_id:'bad'},row,{...row,name:'Test User'}]}));const body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.results.map(r=>r.status),['error','imported','skipped']);
 }finally{if(oldSecret===undefined)delete process.env.SHEETS_CRM_SECRET;else process.env.SHEETS_CRM_SECRET=oldSecret;if(oldSheet===undefined)delete process.env.EIT_LEADS_SPREADSHEET_ID;else process.env.EIT_LEADS_SPREADSHEET_ID=oldSheet;}
});
