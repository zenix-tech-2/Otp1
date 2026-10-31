import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const source=fs.readFileSync('src/lib/brand-assets.ts','utf8');const json=source.slice(source.indexOf('=')+1).trim().replace(/;$/,'');const assets=JSON.parse(json);const catalog=fs.readFileSync('src/lib/catalog.ts','utf8');const domainPart=catalog.slice(catalog.indexOf('brandDomains'),catalog.indexOf('serviceBrands'));const brands=[...domainPart.matchAll(/([a-z]+):\s*"([^"]+)"/g)].map(m=>m[1]);
for(const brand of brands){assert(assets[brand]?.startsWith('data:image/'),`Missing embedded logo: ${brand}`);const file=['svg','png','webp'].map(ext=>`public/brands/${brand}.${ext}`).find(f=>fs.existsSync(f));assert(file,`Missing local logo: ${brand}`);const metadata=await sharp(Buffer.from(assets[brand].split(',')[1],'base64')).metadata();assert(metadata.width>0&&metadata.height>0,`Invalid icon: ${brand}`);}
for(const size of [192,512]){const m=await sharp(`public/icons/icon-${size}.png`).metadata();assert.equal(m.width,size);assert.equal(m.height,size);}const mask=await sharp('public/icons/maskable-512.png').metadata();assert.equal(mask.width,512);assert.equal(mask.height,512);
for(const file of ['public/fonts/jakarta.woff2','public/sw.js','public/offline.html','public/images/hero-art.webp','public/images/promo-banner.webp'])assert(fs.statSync(file).size>0,file);
assert(!fs.readFileSync('src/components/ui.tsx','utf8').includes('google.com/s2/favicons'));assert(!fs.readFileSync('src/components/ui.tsx','utf8').includes('cdn.simpleicons'));
console.log(`PASS ${brands.length} embedded and local brand icons, local font/artwork, and valid PWA icon dimensions. No runtime favicon/CDN dependency.`);
