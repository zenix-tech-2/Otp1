process.env.GRABMAIL_API_KEY="gm_test"; process.env.DROPMAIL_TOKEN="af_test"; process.env.TEMPMAIL_PROVIDERS="v1,v2,v3,v4,v5";
const T=require('./tempmail.js'); const {AppError}=require('./server.js');
let calls=[]; let routes=[];
const reply=(status,body)=>({status,body});
global.fetch=async(url,init={})=>{ calls.push({url:String(url),method:init.method||'GET',headers:init.headers,body:init.body&&String(init.body)});
  for(const r of routes){ if(r.test(String(url),init)){ const x=typeof r.res==='function'?r.res(String(url),init):r.res; const b=(x.body===''||x.body==null)?null:(typeof x.body==='string'?x.body:JSON.stringify(x.body)); return new Response(b,{status:x.status}); } }
  return new Response('{}',{status:404}); };
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m)}else{fail++;console.log('  ✗ FAIL',m)} };
const on=(m,sub)=>(u,i)=>(i.method||'GET')===m&&u.includes(sub);
(async()=>{
console.log('enabled:',T.enabledProviders().join(','));
// ---- V1 GrabMail
console.log('V1 GrabMail'); {
 routes=[{test:on('GET','/api/v1/domains'),res:reply(200,{public:['a.io','b.io'],premium:{unlocked:false,domains:[]}})},
 {test:(u)=>u.includes('/api/v1/mailbox?'),res:reply(200,{messages:[{id:'m1',from:'Jane <j@x.com>',subject:'Hi',date:'2026-10-24T10:00:00Z',seen:false,attachments:1}]})},
 {test:on('GET','/api/v1/message/m1'),res:reply(200,{id:'m1',from:'j@x.com',to:'x@a.io',subject:'Code',date:'2026-10-24T10:00:00Z',text:'Your verification code is 482951',html:'<p>hi</p>',attachments:[{filename:'a.pdf',size_bytes:2048,mime_type:'application/pdf'}]})},
 {test:on('DELETE','/api/v1/message/m1'),res:reply(204,'')}];
 const {adapter}=T.adapterFor('v1'); const c=await adapter.create({name:'zed12345'}); ok(c.address==='zed12345@a.io'||c.address==='zed12345@b.io','create address '+c.address);
 const b={address:c.address,secret:'',ref:''}; const l=await adapter.list(b); ok(l.length===1&&l[0].fromName==='Jane'&&l[0].from==='j@x.com'&&l[0].hasAttachments===true,'list parsed (name/address/attachments)');
 const m=T.fullWithCode(await adapter.read(b,'m1')); ok(m.code==='482951'&&m.attachments[0].name==='a.pdf'&&m.attachments[0].size===2048,'read + code extraction + attachment'); await adapter.remove(b,'m1'); ok(true,'delete ok');
 ok(calls.some(x=>x.headers&&x.headers.Authorization==='Bearer gm_test'),'Bearer key sent');
}
// ---- V2 smails
console.log('V2 smails'); {
 routes=[{test:on('POST','/api/mailbox'),res:(u)=>u.endsWith('/api/mailbox')?reply(200,{address:'cool-fox@smails.dev',token:'cool-fox.abc'}):reply(404,'')},
 {test:(u)=>u.endsWith('/api/mailbox/messages'),res:reply(200,[{id:'7',from:'a@b.com',subject:'Hello',receivedAt:'2026-10-24T09:00:00Z'}])},
 {test:(u)=>u.includes('/messages/7'),res:reply(200,{id:'7',from:'a@b.com',subject:'Hello',text:'Use code 123456 now',html:null})}];
 const {adapter}=T.adapterFor('v2'); const c=await adapter.create({}); ok(c.address==='cool-fox@smails.dev'&&c.secret==='cool-fox.abc','create → address+token');
 const b={address:c.address,secret:c.secret,ref:''}; const l=await adapter.list(b); ok(l.length===1&&l[0].id==='7','list (bare array)');
 const m=T.fullWithCode(await adapter.read(b,'7')); ok(m.code==='123456'&&m.text.includes('123456'),'read + code');
 ok(calls.some(x=>x.url.endsWith('/messages')&&x.headers.Authorization==='Bearer cool-fox.abc'),'token used as bearer');
 routes=[{test:()=>true,res:reply(401,{})}]; try{await adapter.list(b);ok(false,'401 → expired')}catch(e){ok(e instanceof AppError&&e.status===410,'401 → expired (410)')}
}
// ---- V3 MailboxTemp
console.log('V3 MailboxTemp'); {
 routes=[{test:on('POST','/api/inbox/generate'),res:reply(200,{ok:true,address:'x9@mailboxtemp.com',expires:'2026-10-24T12:00:00Z',inboxId:'i1'})},
 {test:(u,i)=>(i.method||'GET')==='GET'&&u.endsWith('/emails'),res:reply(200,{emails:[{id:'e1',from_address:'s@t.com',from_name:'Shop',subject:'Verify',received_at:'2026-10-24T10:01:00Z',read:false,has_attachments:false,otp_code:'998877'}]})},
 {test:(u,i)=>u.includes('/api/email/x9%40mailboxtemp.com/e1'),res:reply(200,{email:{id:'e1',from_address:'s@t.com',from_name:'Shop',subject:'Verify',received_at:'2026-10-24T10:01:00Z',body_text:'Code 998877',body_html:'<b>Code</b>',otp_code:'998877'},attachments:[]})},
 {test:on('POST','/extend'),res:reply(200,{ok:true})},{test:(u,i)=>(i.method||'GET')==='GET'&&u.endsWith('/api/inbox/x9%40mailboxtemp.com'),res:reply(200,{expires_at:'2026-10-24T12:10:00Z'})}];
 const {adapter}=T.adapterFor('v3'); const c=await adapter.create({}); ok(c.address==='x9@mailboxtemp.com'&&c.expiresAt.toISOString()==='2026-10-24T12:00:00.000Z','create + provider expiry');
 const b={address:c.address,secret:'',ref:'i1'}; const l=await adapter.list(b); ok(l[0].code==='998877'&&l[0].fromName==='Shop','list + otp_code');
 const m=await adapter.read(b,'e1'); ok(m.html==='<b>Code</b>'&&m.to===c.address,'read (encoded address path)');
 const e=await adapter.extend(b); ok(e.toISOString()==='2026-10-24T12:10:00.000Z','extend returns new expiry');
}
// ---- V4 mail.tm
console.log('V4 mail.tm'); {
 let tokenCount=0; const msgs={'hydra:member':[{id:'t1',from:{name:'Bob',address:'b@c.com'},subject:'Your code',intro:'Your code is 5544',seen:false,hasAttachments:false,createdAt:'2026-10-24T10:02:00+00:00'}]};
 routes=[{test:on('GET','/domains'),res:reply(200,{'hydra:member':[{domain:'mail.tm',isActive:true}]})},
 {test:on('POST','/accounts'),res:reply(201,{id:'acc1',address:'q@mail.tm'})},
 {test:on('POST','/token'),res:()=>reply(200,{token:'tok'+(++tokenCount),id:'acc1'})},
 {test:(u,i)=>(i.method||'GET')==='GET'&&u.endsWith('/messages'),res:(u,i)=>i.headers.Authorization==='Bearer tok2'?reply(200,msgs):reply(401,{})},
 {test:(u,i)=>u.includes('/messages/t1'),res:reply(200,{id:'t1',from:{name:'Bob',address:'b@c.com'},to:[{address:'q@mail.tm'}],subject:'Your code',text:'Your code is 5544',html:['<p>Your code is 5544</p>'],attachments:[],createdAt:'2026-10-24T10:02:00+00:00'})}];
 const {adapter}=T.adapterFor('v4'); const c=await adapter.create({name:'q'+'abc'}); ok(c.address.endsWith('@mail.tm')&&JSON.parse(c.secret).token==='tok1','create account + token');
 let stored=c.secret; const b={address:c.address,secret:c.secret,ref:c.ref};
 const l=await T.withAuth('v4',b,(a,x)=>a.list(x),async s=>{stored=s}); ok(l.length===1&&l[0].code==='5544','list works after automatic re-login on 401'); ok(JSON.parse(stored).token==='tok2','refreshed token saved');
 const m=await adapter.read({...b,secret:stored},'t1'); ok(m.html==='<p>Your code is 5544</p>'&&m.to==='q@mail.tm','read joins html array');
 ok(T.providerCredits().length===1,'credit shown when v4 enabled');
}
// ---- V5 DropMail
console.log('V5 DropMail'); {
 let tier=0; const sess={expiresAt:'2026-10-24T10:10:00Z',mails:[{id:'d1',fromAddr:'noreply@x.com',toAddr:'abc@dropmail.me',headerFrom:'X Team <noreply@x.com>',headerSubject:'Verify',headerDate:'2026-10-24T10:03:00Z',text:'Your verification code: 246810',html:null,downloadUrl:'https://dropmail.me/download/mail/1'}]};
 routes=[{test:(u,i)=>u.includes('/api/graphql/af_test'),res:(u,i)=>{ const p=new URLSearchParams(String(i.body)); const q=p.get('query'); 
   if(q.includes('domains{')) return reply(200,{data:{domains:[{id:'RG9tYWluOjE',name:'dropmail.me',availableViaApi:true}]}});
   if(q.includes('introduceSession')) return reply(200,{data:{introduceSession:{id:'S1',expiresAt:'x',addresses:[{address:'abc@dropmail.me'}]}}});
   if(q.includes('session(')){ if(q.includes('headerDate')) return reply(200,{errors:[{message:'Cannot query field "headerDate" on type "Mail".'}]}); return reply(200,{data:{session:{expiresAt:sess.expiresAt,mails:sess.mails.map(({headerDate,...m})=>m)}}}); }
   return reply(200,{errors:[{message:'bad'}]}); }}];
 const {adapter}=T.adapterFor('v5'); const c=await adapter.create({}); ok(c.address==='abc@dropmail.me'&&c.ref==='S1','create session + address');
 const b={address:c.address,secret:'',ref:'S1'}; const l=await adapter.list(b); ok(l.length===1&&l[0].id==='d1'&&l[0].fromName==='X Team'&&l[0].code==='246810','list works after field-tier fallback');
 const m=await adapter.read(b,'d1'); ok(m.text.includes('246810')&&m.to==='abc@dropmail.me','read');
 const secret=adapter.hide(b,'d1'); const l2=await adapter.list({...b,secret}); ok(l2.length===0,'delete hides message');
 ok(calls.some(x=>x.url.includes('/api/graphql/af_test')&&x.method==='POST'),'token in URL, POST form body');
 routes=[{test:()=>true,res:reply(200,{data:{session:null}})}]; try{await adapter.list(b);ok(false,'expired')}catch(e){ok(e.status===410,'null session → expired (410)')}
}
// ---- code extraction
console.log('Codes'); const {extractCode}=require('./tempmail-core.js');
ok(extractCode('Your code is 482 951')==='482951','spaced 6 digits'); ok(extractCode('G-123456 is your Google verification code')==='123456','reverse form'); ok(extractCode('Order #123456789 shipped')===null,'no false positive on order numbers');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
