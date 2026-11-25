import {structuralLayout,type LayoutTopology} from "../../../../kb/semantic/structural-layout";

self.addEventListener("message",(event:MessageEvent<LayoutTopology>)=>{
  try{self.postMessage({ok:true,value:structuralLayout(event.data)});}
  catch{self.postMessage({ok:false});}
});
