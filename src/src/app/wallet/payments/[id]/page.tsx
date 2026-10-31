import {WalletPanel} from "@/components/wallet-panel";
import {RequireAccount} from "@/components/account-pages";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <RequireAccount returnTo={`/wallet/payments/${id}`}><WalletPanel paymentId={id}/></RequireAccount>;}
