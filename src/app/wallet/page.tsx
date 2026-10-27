import {WalletPanel} from "@/components/wallet-panel";
import {RequireAccount} from "@/components/account-pages";
export default function Page(){return <RequireAccount returnTo="/wallet"><WalletPanel/></RequireAccount>;}
