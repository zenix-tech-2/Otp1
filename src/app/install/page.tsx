import type {Metadata} from "next";
import {InstallPage} from "@/components/install-page";
export const metadata:Metadata={title:"Install the app",description:"Add Store OTP to your home screen with browser installation for Android, iPhone, and desktop."};
export default function Page(){return <InstallPage/>;}
