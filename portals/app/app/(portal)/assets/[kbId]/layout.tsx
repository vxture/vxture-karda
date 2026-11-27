import type {ReactNode} from "react";
import {LibraryWorkspace} from "./library-workspace";
export default async function Layout({children,params}:{children:ReactNode;params:Promise<{kbId:string}>}){
 const {kbId}=await params;return <><LibraryWorkspace kbId={kbId}/>{children}</>;
}
