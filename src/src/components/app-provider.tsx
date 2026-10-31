"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {CheckCircle2,CircleAlert,X} from "lucide-react";
import type {PublicProduct} from "@/db/schema";
import type {StoreCategory} from "@/lib/categories";
import {formatMoney,fromUsd,type CurrencyQuote} from "@/lib/currency";
import {customerRoutes,safeReturnTo} from "@/lib/navigation";
export type Account={id:string;name:string;email:string;balance:number;role:string;isDemo:boolean;countryCode:string;countryName:string;currency:string};
export type {Article as News} from "@/lib/content-types";
import type {Article as News} from "@/lib/content-types";
export type StoreSettings={appName:string;smsMarkup:number;smmMarkup:number;supportEmail:string;maintenance:boolean;allowRegistrations:boolean;announcement:string;currency:string};
export type Catalog={categories:StoreCategory[];products:PublicProduct[];announcements:News[];settings:StoreSettings;demo:boolean};
type Toast={message:string;kind:"success"|"error"};
type Context=Catalog&{user:Account|null;pricing:CurrencyQuote|null;accountLoading:boolean;refreshAccount:()=>Promise<void>;refreshCatalog:()=>Promise<void>;notify:(message:string,kind?:Toast["kind"])=>void;panel:string|null;openPanel:(panel:string)=>void;closePanel:()=>void};
const StoreContext=createContext<Context|null>(null);
export async function api<T=Record<string,unknown>>(url:string,options?:RequestInit):Promise<T>{const response=await fetch(url,{...options,headers:{...(options?.body&&!(options.body instanceof FormData)?{"Content-Type":"application/json"}:{}),...options?.headers}});let data;try{data=await response.json();}catch{throw new Error("The server is taking a moment. Please try again.");}if(!response.ok)throw new Error(data.error||"We couldn’t complete your request.");return data as T;}
export function AppProvider({children,initialCatalog}:{children:ReactNode;initialCatalog:Catalog}){
 const [catalog,setCatalog]=useState(initialCatalog);const [user,setUser]=useState<Account|null>(null);const [pricing,setPricing]=useState<CurrencyQuote|null>({currency:"USD",usdRate:"1",asOf:"",source:"base"});const [accountLoading,setAccountLoading]=useState(true);const [toast,setToast]=useState<Toast|null>(null);
 const router=useRouter();const pathname=usePathname();const params=useSearchParams();const panel=params.get("panel")==="menu"?"menu":null;const drawerPushed=useRef(false);const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=useCallback((message:string,kind:Toast["kind"]="success")=>{if(toastTimer.current)clearTimeout(toastTimer.current);setToast({message,kind});toastTimer.current=setTimeout(()=>setToast(null),5000);},[]);
 const refreshAccount=useCallback(async()=>{try{const result=await api<{user:Account|null;pricing:CurrencyQuote|null}>("/api/auth");setUser(result.user);setPricing(result.pricing);}finally{setAccountLoading(false);}},[]);
 const refreshCatalog=useCallback(async()=>{setCatalog(await api<Catalog>("/api/catalog"));},[]);
 useEffect(()=>{refreshAccount().catch(()=>setAccountLoading(false));},[refreshAccount]);
 useEffect(()=>{setCatalog(initialCatalog);},[initialCatalog]);
 const openPanel=useCallback((name:string)=>{
   if(name==="menu"){const q=new URLSearchParams(params.toString());q.set("panel","menu");drawerPushed.current=true;router.push(`${pathname}?${q}`,{scroll:false});return;}
   const path=customerRoutes[name];if(!path)return;const q=new URLSearchParams();
   if(["login","register","wallet","support"].includes(name)){const current=new URLSearchParams(params.toString());current.delete("panel");const existing=params.get("returnTo");const returnTo=safeReturnTo(existing||`${pathname}${current.size?`?${current}`:""}`,"/account");if(returnTo!==path)q.set("returnTo",returnTo);}
   router.push(path+(q.size?`?${q}`:""));
 },[params,pathname,router]);
 const closePanel=useCallback(()=>{
   if(panel==="menu"){if(drawerPushed.current){drawerPushed.current=false;router.back();}else{const q=new URLSearchParams(params.toString());q.delete("panel");router.replace(pathname+(q.size?`?${q}`:""),{scroll:false});}return;}
   router.replace(safeReturnTo(params.get("returnTo"),pathname.startsWith("/wallet")?"/account":"/account"));
 },[params,pathname,router,panel]);
 useEffect(()=>{if(!panel)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape")closePanel();};document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key);},[panel,closePanel]);
 return <StoreContext.Provider value={{...catalog,user,pricing,accountLoading,refreshAccount,refreshCatalog,notify,panel,openPanel,closePanel}}>{children}{toast&&<div className={`toast toast-${toast.kind}`} role="status">{toast.kind==="success"?<CheckCircle2 size={20}/>:<CircleAlert size={20}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={16}/></button></div>}</StoreContext.Provider>;
}
export function useStore(){const context=useContext(StoreContext);if(!context)throw new Error("Store provider is missing");return context;}
export function useMoney(){const {user,pricing}=useStore();const currency=user?.currency||"USD";const localPrice=(usdCents:number)=>{try{return pricing&&pricing.currency===currency?fromUsd(usdCents,pricing):currency==="USD"?usdCents:null;}catch{return null;}};return {currency,pricingReady:currency==="USD"||pricing?.currency===currency,localPrice,money:(minor:number,code=currency)=>formatMoney(minor,code),price:(usdCents:number)=>{const amount=localPrice(usdCents);return amount==null?`${formatMoney(usdCents,"USD")} USD`:formatMoney(amount,currency);}};}
