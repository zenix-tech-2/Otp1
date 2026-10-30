const ts=require('/home/claude/.npm-global/lib/node_modules/typescript');const fs=require('fs');
const src='/home/claude/proj/storeotp-main/src/lib/';
for(const f of ['tempnumbers.ts','tempnumbers-core.ts','tempmail-core.ts']){const r=ts.transpileModule(fs.readFileSync(src+f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}});fs.writeFileSync(f.replace('.ts','.js'),r.outputText);}
