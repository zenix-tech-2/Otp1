import type {Metadata} from "next";
import {InstallPage} from "@/components/install-page";
export const metadata:Metadata={title:"Install the app",description:"Add Digisms Pro to your home screen with browser installation for Android, iPhone, and desktop."};
export default function Page(){return <InstallPage/>;}
