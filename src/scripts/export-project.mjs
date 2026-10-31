// Portable source ZIP. Excludes secrets, build output, dependencies, and customer data.
// Run: node scripts/export-project.mjs
import fs from 'node:fs';
import path from 'node:path';
import {zipSync,unzipSync} from 'fflate';
const excluded=new Set(['node_modules','.next','.git','.vercel','out','exports','playwright-report','test-results']);
const files={};
function walk(directory=''){for(const item of fs.readdirSync(directory||'.',{withFileTypes:true})){const relative=path.posix.join(directory,item.name);if(item.isSymbolicLink())continue;if(item.isDirectory()){if(excluded.has(item.name)||relative==='tests/screenshots')continue;walk(relative);continue;}if(item.name==='.env'||item.name.startsWith('.env.')&&item.name!=='.env.example'||/\.(log|tsbuildinfo)$/.test(item.name))continue;files[`store-otp/${relative}`]=new Uint8Array(fs.readFileSync(relative));}}
walk();
const required=['public/icon.svg','public/icons/icon-192.png','public/icons/icon-512.png','public/icons/maskable-512.png','public/icons/apple-touch-icon.png','public/fonts/jakarta.woff2','public/images/hero-art.webp','public/images/promo-banner.webp','public/images/sim.webp','public/images/server.webp','public/images/crown.webp','public/images/gift.webp','public/sw.js','public/offline.html','src/lib/brand-assets.ts','src/app/manifest.ts','.env.example','README.md','MEDIA-PWA.md','supabase/upgrade-media-uploads.sql'];
for(const file of required)if(!files[`store-otp/${file}`])throw new Error(`Required export asset missing: ${file}`);
if(files['store-otp/.env'])throw new Error('Refusing to export secrets');
fs.mkdirSync('exports',{recursive:true});const archive=zipSync(files,{level:6});fs.writeFileSync('exports/store-otp-source.zip',archive);
const check=unzipSync(archive);for(const file of required)if(!check[`store-otp/${file}`])throw new Error('ZIP validation failed: '+file);
console.log(`Exported ${Object.keys(files).length} files, including ${Object.keys(files).filter(f=>f.startsWith('store-otp/public/')).length} bundled public assets.`);console.log(`ZIP verified: exports/store-otp-source.zip (${(archive.length/1024/1024).toFixed(2)} MB). Environment secrets and customer database/storage files are excluded.`);
