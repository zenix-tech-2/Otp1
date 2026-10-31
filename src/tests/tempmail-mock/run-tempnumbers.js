process.env.TEMPNUMBERS_PROVIDERS="v1,v2";
const N=require('./tempnumbers.js'); const {AppError}=require('./server.js'); let urls=[]; let mode='ok';
global.fetch=async(u)=>{ u=new URL(String(u)); urls.push(u.toString()); const p=u.searchParams;
  if(mode==='err') return new Response(JSON.stringify({response:'TRY_AGAIN_LATER'}),{status:200});
  if(p.get('number')) return new Response(JSON.stringify({response:1,messages:{data:[{text:'G-585019 is your Google verification code.',in_number:'***2601',my_number:9915584911,created_at:'2026-10-24 15:32:14',data_humans:'1 minute ago'},{text:'hello there',in_number:'***1111',created_at:'2026-10-24 15:30:00',data_humans:'3 minutes ago'}]}}),{status:200});
  if(p.get('country')) return new Response(JSON.stringify({response:1,numbers:{'9915584911':{country:7,full_number:'+79915584911',data_humans:'6 days ago',is_archive:false},'9000000000':{country:7,full_number:'+79000000000',data_humans:'1 year ago',is_archive:true}}}),{status:200});
  return new Response(JSON.stringify({response:1,countries:[{country:7,country_text:'Russia',country_original:'russia'},{country:44,country_text:'Britain'}]}),{status:200}); };
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗ FAIL',m)};
(async()=>{
 console.log('enabled:',N.enabledNumberProviders().join(','),'(v2 has no adapter, so hidden)'); ok(N.enabledNumberProviders().join()==='v1','only built versions are offered');
 const {adapter,id}=N.freeAdapter(null); ok(id==='v1','default provider v1');
 const c=await adapter.countries(); ok(c.length===2&&c[0].name==='Britain'&&c[1].id==='7','countries parsed + sorted');
 const n=await adapter.numbers('7'); ok(n.length===1&&n[0].number==='+79915584911'&&n[0].local==='9915584911','numbers parsed, archived hidden');
 const m=await adapter.messages('7','9915584911',30); ok(m.length===2&&m[0].code==='585019'&&m[0].from==='***2601'&&m[1].code===null,'messages parsed + code detected');
 ok(urls.some(u=>u.includes('lang=en')),'language set'); const before=urls.length; await adapter.countries(); await adapter.numbers('7'); ok(urls.length===before,'repeat calls served from cache');
 mode='err'; try{await adapter.numbers('44');ok(false,'error')}catch(e){ok(e instanceof AppError&&e.status===502,'upstream error code → friendly 502')}
 try{N.freeAdapter('v9');ok(false,'unknown')}catch(e){ok(e.status===503,'unknown/disabled version rejected')}
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);})();
