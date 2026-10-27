const ts=require('/home/claude/.npm-global/lib/node_modules/typescript');const fs=require('fs');const path=require('path');
const src='/home/claude/proj/Digismspro-main/src/lib/';
for(const f of ['tempmail.ts','tempmail-core.ts']){const r=ts.transpileModule(fs.readFileSync(src+f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}});fs.writeFileSync(f.replace('.ts','.js'),r.outputText);}
fs.writeFileSync('server.js','class AppError extends Error{constructor(m,status=400){super(m);this.status=status}};module.exports={AppError};');
fs.mkdirSync('node_modules/server-only',{recursive:true});fs.writeFileSync('node_modules/server-only/index.js','');
