import {ProductDetail} from "@/components/store-pages";
import {RequireAccount} from "@/components/account-pages";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <RequireAccount returnTo={`/store/product/${id}/checkout`}><ProductDetail id={id} checkout/></RequireAccount>;}
