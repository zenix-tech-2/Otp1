import {OrderReceipt} from "@/components/order-receipt";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <OrderReceipt id={id}/>;}
