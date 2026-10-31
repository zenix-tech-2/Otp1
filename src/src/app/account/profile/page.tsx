import {ProfilePanel} from "@/components/profile-panel";
import {RequireAccount} from "@/components/account-pages";
export default function Page(){return <RequireAccount returnTo="/account/profile"><ProfilePanel/></RequireAccount>;}
