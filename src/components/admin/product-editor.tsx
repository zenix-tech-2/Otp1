"use client";
import {useMemo,useRef,useState,type FormEvent} from "react";
import {Check,ImagePlus,LockKeyhole,Save} from "lucide-react";
import {brandDomains} from "@/lib/catalog";
import {fieldsForCategory} from "@/lib/categories";
import {countries,countryByCode,flagFor} from "@/lib/countries";
import {digitalTypes,normalizeCourse,normalizeLink,parseDelivery,serializeSlot,type DigitalType,type SlotKind} from "@/lib/delivery";
import {uploadFile} from "@/lib/upload-client";
import {useStore} from "../app-provider";
import {BrandIcon,InfoBox,InlineError,ModalFrame,Spinner} from "../ui";
import {ProductFileField} from "./product-file-field";
import {CourseBuilder,emptyCourse} from "./course-builder";
import {SlotEditor,type Slot} from "./slot-editor";
import {useAdmin} from "./admin-workspace";

type FormKind="proxies"|"social"|"subscriptions"|"digital"|"standard";
const slotKinds:Record<string,SlotKind>={proxies:"proxy",social:"account",subscriptions:"account"};

export function ProductEditor({productId}:{productId:string}){
 const {data,perform,closeRecord}=useAdmin();const {notify}=useStore();const categories=data.categories.filter(c=>c.kind==='products');const existing=data.products.find(p=>p.id===productId);
 const fileDelivery=Boolean(existing?.fulfillment&&(existing.fulfillment.startsWith('supabase:')||existing.fulfillment.startsWith('upload:')));
 const existingDelivery=useMemo(()=>parseDelivery(existing?.fulfillment),[existing?.fulfillment]);
 const [category,setCategory]=useState(existing?.category||categories.find(c=>c.active)?.id||'');const [brand,setBrand]=useState(existing?.brand||'generic');const [imageUrl,setImageUrl]=useState(existing?.imageUrl||'');const [delivery,setDelivery]=useState(existing?.metadata.deliveryMode||(fileDelivery?'file':existing?.fulfillment?'instructions':'manual'));const [privateFile,setPrivateFile]=useState(fileDelivery?existing!.fulfillment!:'');
 const [fileName,setFileName]=useState(existing?.metadata.fileName||'');const [fileBytes,setFileBytes]=useState(existing?.metadata.fileBytes||'');const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState('');const imageRef=useRef<HTMLInputElement>(null);
 const [countryCode,setCountryCode]=useState(existing?.metadata.countryCode||'');const [slots,setSlots]=useState<Slot[]>([]);
 const [digitalType,setDigitalType]=useState<DigitalType>((existing?.metadata.digitalType as DigitalType)||(existing?(fileDelivery?'software':existing.metadata.deliveryMode==='inventory'?'license_keys':existing.fulfillment?'custom':'ebook'):'ebook'));
 const [course,setCourse]=useState(()=>existingDelivery?.t==='course'?existingDelivery:emptyCourse());
 const [linkUrl,setLinkUrl]=useState(existingDelivery?.t==='link'?existingDelivery.url:'');const [linkLabel,setLinkLabel]=useState(existingDelivery?.t==='link'?existingDelivery.label||'':'');const [linkNote,setLinkNote]=useState(existingDelivery?.t==='link'?existingDelivery.note||'':'');
 const [keys,setKeys]=useState('');
 const current=categories.find(c=>c.id===category);const formKind:FormKind=(["proxies","social","subscriptions","digital"].includes(current?.formType||'')?current!.formType:"standard") as FormKind;
 const slotKind=slotKinds[formKind];const slotForm=Boolean(slotKind);const needsCountry=formKind==="proxies"||formKind==="social";
 const typeInfo=digitalTypes.find(t=>t.id===digitalType);
 const mode=slotForm?'inventory':formKind==='digital'&&typeInfo?.mode?typeInfo.mode:delivery;
 const hiddenKeys=current?.fields?.length?[]:formKind==='proxies'?['region','protocol']:formKind==='social'||formKind==='subscriptions'?['region']:[];
 const fields=fieldsForCategory(current).filter(f=>!hiddenKeys.includes(f.key));
 const existingUnits=existing&&existing.metadata.deliveryMode==='inventory'?existing.stock:0;
 const keyLines=keys.split('\n').map(s=>s.trim()).filter(Boolean);const newUnits=slotForm?slots.length:mode==='inventory'?keyLines.length:0;
 const isEbook=formKind==='digital'&&digitalType==='ebook';
 async function image(file?:File){if(!file)return;setUploading(true);setError('');try{const r=await uploadFile(file,'image');setImageUrl(r.url);notify(isEbook?'Cover uploaded.':'Product image uploaded.');}catch(e){setError((e as Error).message);}finally{setUploading(false);}}
 function chooseCategory(id:string){setCategory(id);const next=categories.find(c=>c.id===id);if(next?.formType==='proxies'&&brand==='generic')setBrand('proxy');setError('');}
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');
  try{
   const form=new FormData(event.currentTarget);const metadata:Record<string,string>={};for(const f of fields)metadata[f.key]=String(form.get(`meta_${f.key}`)||'');
   if(needsCountry){const country=countryByCode(countryCode);if(!country)throw new Error('Choose the country this listing belongs to, so customers know where it is from.');metadata.country=country.name;metadata.countryCode=country.code;}
   if(slotForm)metadata.slotType=slotKind;
   if(formKind==='digital'){metadata.digitalType=digitalType;if(digitalType==='ebook')metadata.author=String(form.get('meta_author')||'');}
   if(isEbook&&!imageUrl)throw new Error('Upload the ebook cover so it shows in the store.');
   metadata.deliveryMode=mode;metadata.delivery=mode==='manual'?'Manual fulfillment':'Instant delivery';
   let fulfillment:string|null=null;let inventory:string[]|undefined;
   if(mode==='instructions')fulfillment=String(form.get('fulfillment')||'');
   if(mode==='file'){if(!privateFile)throw new Error(isEbook?'Upload the ebook file first.':'Please upload and validate your private delivery file first.');fulfillment=privateFile;metadata.fileName=fileName;metadata.fileBytes=fileBytes;}
   if(mode==='link')fulfillment=JSON.stringify(normalizeLink({t:'link',url:linkUrl,label:linkLabel,note:linkNote}));
   if(mode==='course'){if(uploading)throw new Error('Wait for your lesson videos to finish uploading.');fulfillment=JSON.stringify(normalizeCourse(course));}
   if(mode==='inventory')inventory=slotForm?slots.map(slot=>serializeSlot(slot)):keyLines;
   const product={...(existing?{id:existing.id}:{}),name:String(form.get('name')),description:String(form.get('description')),category,brand,imageUrl,price:Math.round(Number(form.get('price'))*100),comparePrice:form.get('comparePrice')?Math.round(Number(form.get('comparePrice'))*100):null,stock:mode==='inventory'?existingUnits+newUnits:Number(form.get('stock')),badge:String(form.get('badge')||'')||null,active:form.get('active')==='on',metadata,fulfillment,inventory};
   await perform('save-product',{product},existing?'Product updated. Your changes are live.':'Your new product is ready for the store.');closeRecord('edit');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function close(){if(uploading){setError('Wait for the upload to finish or cancel it before leaving.');return;}closeRecord('edit');}
 const keysField=<label className="field-label fulfillment-field">{formKind==='digital'?'License keys or codes — one per line':'Add unique stock items — one delivery per line'}<textarea value={keys} onChange={e=>setKeys(e.target.value)} rows={5} placeholder={"LICENSE-KEY-ONE | setup instructions\nLICENSE-KEY-TWO | setup instructions"}/><span className="field-help">Each line is assigned to one order only. Existing unsold items are preserved.{existingUnits>0?` ${existingUnits} unsold already in stock.`:''}</span></label>;
 const fileField=<ProductFileField value={privateFile} name={fileName} storageConnected={data.storageConnected} onBusy={setUploading} onChange={file=>{setPrivateFile(file.url);setFileName(file.name);setFileBytes(String(file.size));}}/>;
 const linkFields=<div className="form-grid"><label className="field-label form-span-two">Link customers receive<input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://" inputMode="url" maxLength={2000} required/></label><label className="field-label">Button text (optional)<input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder={digitalType==='course_link'?'Open your course':'Open access link'} maxLength={80}/></label><label className="field-label form-span-two">Instructions (optional)<textarea value={linkNote} onChange={e=>setLinkNote(e.target.value)} rows={3} maxLength={2000} placeholder="Login steps, access code or anything the customer should know."/></label></div>;
 const genericDelivery=<>
  <label className="field-label">How will the customer receive it?<select aria-label="Delivery method" value={delivery==='link'||delivery==='course'?'instructions':delivery} onChange={e=>setDelivery(e.target.value)}><option value="manual">Manual delivery — fulfill from purchases</option><option value="instructions">Instant shared instructions / access link</option><option value="inventory">Unique credentials or license per purchase</option><option value="file">Private downloadable file (including APK)</option></select></label>
  {mode==='instructions'&&<label className="field-label fulfillment-field">Delivery instructions (only visible after purchase)<textarea name="fulfillment" defaultValue={!fileDelivery&&!existingDelivery?existing?.fulfillment||'':''} required minLength={5} maxLength={15000} rows={4} placeholder="Use unique inventory for individual passwords or licenses."/></label>}
  {mode==='inventory'&&keysField}
  {mode==='file'&&fileField}
  {mode==='manual'&&<InfoBox>Orders appear as “processing”. Add private delivery details from the purchase record when you’re ready.</InfoBox>}
 </>;
 return <ModalFrame title={existing?'A little product polish.':'Make room for something new.'} subtitle={existing?'Update your listing, pricing, and delivery details.':'Choose a category. We’ll tailor the form to your product.'} onClose={close} wide><form className="product-editor-form" onSubmit={submit}>
 <div className="editor-section"><span className="editor-section-label"><span>01</span>Choose your product category</span><div className="editor-category-grid">{categories.filter(c=>c.active||c.id===category).map(c=><button key={c.id} type="button" className={category===c.id?'selected':''} onClick={()=>chooseCategory(c.id)}>{c.name}{category===c.id&&<Check size={12}/>}</button>)}</div></div>
 <div className="editor-section"><span className="editor-section-label"><span>02</span>The essentials</span><div className="editor-brand-row">{imageUrl?<img className="editor-image-preview" src={imageUrl} alt={isEbook?'Ebook cover preview':'Product image preview'}/>:<BrandIcon brand={brand} size={61}/>}<div><strong>{isEbook?'Your ebook cover':'Your product’s first impression'}</strong><p>{isEbook?'Upload the cover customers will see in the store.':'Choose a bundled brand logo or upload your own image.'}</p><div><button type="button" className="text-link-button" onClick={()=>imageRef.current?.click()} disabled={uploading}>{uploading?<Spinner size={12}/>:<ImagePlus size={13}/>}{isEbook?'Upload cover':'Upload image'}</button>{imageUrl&&!isEbook&&<button type="button" className="editor-remove-image" onClick={()=>setImageUrl('')}>Use brand logo</button>}</div></div><input ref={imageRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif" aria-label="Upload product image" hidden onChange={e=>image(e.target.files?.[0])}/></div><div className="form-grid"><label className="field-label">Product name<input name="name" defaultValue={existing?.name} placeholder="Give your product a clear name" minLength={2} maxLength={120} required/></label><label className="field-label">Brand / platform<select value={brand} aria-label="Brand / platform" onChange={e=>setBrand(e.target.value)}><option value="generic">Custom product</option><option value="proxy">Residential proxy</option>{Object.keys(brandDomains).map(b=><option key={b} value={b}>{b==='chatgpt'?'ChatGPT':b.charAt(0).toUpperCase()+b.slice(1)}</option>)}</select></label><label className="field-label form-span-two">Product description<textarea name="description" defaultValue={existing?.description} placeholder="Explain what the customer receives, including requirements." rows={3} minLength={10} maxLength={4000} required/></label></div></div>
 <div className="editor-section"><span className="editor-section-label"><span>03</span>{current?.name} details</span><div className="form-grid" key={category}>{needsCountry&&<label className="field-label form-span-two">{formKind==='proxies'?'Proxy country':'Account country'} *<select value={countryCode} onChange={e=>setCountryCode(e.target.value)} aria-label="Country" required><option value="">Select a country</option>{countries.map(c=><option key={c.code} value={c.code}>{flagFor(c.code)} {c.name}</option>)}</select><span className="field-help">Customers see this country on the listing before they buy.</span></label>}{fields.map(f=><label className="field-label" key={f.key}>{f.label}<input name={`meta_${f.key}`} defaultValue={existing?.category===category?existing.metadata[f.key]:''} placeholder={f.placeholder} maxLength={1000}/></label>)}</div></div>
 <div className="editor-section"><span className="editor-section-label"><span>04</span>Pricing & availability</span><div className="form-grid"><label className="field-label">Selling price (USD)<div className="input-with-prefix"><span>$</span><input name="price" type="number" min="0.01" max="100000" step="0.01" defaultValue={existing?existing.price/100:''} placeholder="5.99" required/></div></label><label className="field-label">Compare-at price (optional)<div className="input-with-prefix"><span>$</span><input name="comparePrice" type="number" min="0" step="0.01" defaultValue={existing?.comparePrice?existing.comparePrice/100:''} placeholder="7.99"/></div></label>{mode==='inventory'?<label className="field-label">{slotForm?'Available slots (follows your stock slots)':'Available units (follows your stock items)'}<input name="stock" type="number" value={existingUnits+newUnits} readOnly/></label>:<label className="field-label">Available stock<input name="stock" type="number" min="0" max="1000000" step="1" defaultValue={existing?.stock??10} required/></label>}<label className="field-label">Product badge<select name="badge" defaultValue={existing?.badge||''}><option value="">No badge</option><option>Bestseller</option><option>Popular</option><option>New</option></select></label></div></div>
 <div className="editor-section"><span className="editor-section-label"><span>05</span>{slotForm?(formKind==='proxies'?'Proxy slots':'Account slots'):formKind==='digital'?'What are you selling?':'Private fulfillment'}<LockKeyhole size={13}/></span>
  {slotForm&&<SlotEditor kind={slotKind} slots={slots} onChange={setSlots} available={existingUnits}/>}
  {formKind==='digital'&&<>
   <div className="editor-category-grid digital-type-grid" role="group" aria-label="Digital product type">{digitalTypes.map(t=><button key={t.id} type="button" className={digitalType===t.id?'selected':''} onClick={()=>{setDigitalType(t.id);setError('');}}>{t.label}{digitalType===t.id&&<Check size={12}/>}</button>)}</div>
   <p className="field-help digital-type-hint">{typeInfo?.hint}</p>
   {digitalType==='ebook'&&<>{fileField}<label className="field-label">Author (optional)<input name="meta_author" defaultValue={existing?.metadata.author||''} placeholder="Who wrote it?" maxLength={120}/></label></>}
   {(digitalType==='software'||digitalType==='bundle')&&fileField}
   {digitalType==='video_course'&&<CourseBuilder course={course} onChange={setCourse} onBusy={setUploading}/>}
   {(digitalType==='course_link'||digitalType==='access_link')&&linkFields}
   {digitalType==='license_keys'&&keysField}
   {digitalType==='custom'&&genericDelivery}
  </>}
  {formKind==='standard'&&genericDelivery}
 </div>
 <div className="editor-publish-row"><label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={existing?.active??true}/><span><strong>Publish this product in the store</strong><small>Only list software, content, and accounts you are authorized to distribute.</small></span></label><span className="mini-tag">{data.demo?'Sandbox listing':'Live store listing'}</span></div><InlineError message={error}/><div className="editor-actions"><button type="button" className="button button-secondary" onClick={close}>Cancel</button><button type="submit" className="button button-primary" disabled={busy||uploading||!category}>{busy?<Spinner/>:<><Save size={15}/>{existing?'Save product':'Publish product'}</>}</button></div></form></ModalFrame>;
}
