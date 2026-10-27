// Optional regeneration tool. Generated assets are committed; deployments do NOT need network access.
import fs from 'node:fs';
import path from 'node:path';
import * as icons from 'simple-icons';
import sharp from 'sharp';
const catalog=fs.readFileSync('src/lib/catalog.ts','utf8');const domains=Object.fromEntries([...catalog.slice(catalog.indexOf('brandDomains'),catalog.indexOf('serviceBrands')).matchAll(/([a-z]+):\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
const aliases={openai:'openai',chatgpt:'openai',x:'x',steam:'steam',microsoft:'microsoft',linkedin:'linkedin',adobe:'adobe',yahoo:'yahoo',claude:'claude',alibaba:'alibabadotcom',blizzard:'blizzardentertainment',line:'line',proton:'proton',ticketmaster:'ticketmaster'};
const index=Object.fromEntries(Object.values(icons).filter(i=>i&&typeof i==='object'&&i.slug).map(i=>[i.slug,i]));
fs.mkdirSync('public/brands',{recursive:true});fs.mkdirSync('public/icons',{recursive:true});
const embedded={};const sources=[];const missing=[];
for(const [brand,domain] of Object.entries(domains)){
 let file=['svg','png','webp'].map(ext=>`public/brands/${brand}.${ext}`).find(f=>fs.existsSync(f));
 if(!file){const icon=index[aliases[brand]||brand];if(icon){file=`public/brands/${brand}.svg`;fs.writeFileSync(file,icon.svg.replace('<svg ','<svg fill="#'+icon.hex+'" '));sources.push(`${brand}: Simple Icons (${icon.source})`);}else{
  try{const response=await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Icon unavailable');const buffer=Buffer.from(await response.arrayBuffer());const png=await sharp(buffer).resize(96,96,{fit:'contain'}).png().toBuffer();file=`public/brands/${brand}.png`;fs.writeFileSync(file,png);sources.push(`${brand}: ${domain} website icon, downloaded into this project (no runtime request)`);}catch{missing.push(brand);continue;}}
 }
 const bytes=fs.readFileSync(file);const mime=file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'image/png';embedded[brand]=`data:${mime};base64,${bytes.toString('base64')}`;
}
if(!embedded.openai&&embedded.chatgpt)embedded.openai=embedded.chatgpt;
if(missing.length)throw new Error(`Missing portable brand assets: ${missing.join(', ')}`);
fs.writeFileSync('src/lib/brand-assets.ts','// Generated, portable brand artwork. No CDN or favicon service is used at runtime.\n// Each icon is embedded AND supplied as a file in public/brands.\nexport const brandAssets: Record<string,string> = '+JSON.stringify(embedded,null,2)+';\n');
const icon=fs.readFileSync('public/icon.svg');for(const size of [192,512])await sharp(icon).resize(size,size).png().toFile(`public/icons/icon-${size}.png`);
await sharp(icon).resize(180,180).png().toFile('public/icons/apple-touch-icon.png');
const inset=await sharp(icon).resize(320,320).png().toBuffer();await sharp({create:{width:512,height:512,channels:4,background:'#1754f5'}}).composite([{input:inset,left:96,top:96}]).png().toFile('public/icons/maskable-512.png');
fs.writeFileSync('public/brands/NOTICE.md','# Bundled brand assets\n\nThese files and the embedded copies in src/lib/brand-assets.ts travel with the source export. No third-party icon requests are made at runtime.\n\nBrand names and logos belong to their respective owners; display does not imply affiliation. Simple Icons artwork is provided under its project terms: https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md\n\n'+sources.join('\n')+'\n');
console.log(`Bundled and embedded ${Object.keys(embedded).length} brand icons. Generated Android, maskable, and Apple installation icons.`);
