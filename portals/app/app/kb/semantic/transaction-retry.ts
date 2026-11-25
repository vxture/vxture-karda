/** Call only around a complete DB attempt whose catch/finally roll back and release.
 * No model calls, deliveries or other external writes may run inside this scope. */
export async function retrySemanticTransaction<T>(attempt:()=>Promise<T>):Promise<T>{
  for(let index=0;;index++){
    try{return await attempt();}
    catch(error){
      if(index>=2||!error||typeof error!=="object"||!("code" in error)||error.code!=="40P01")throw error;
      await new Promise(resolve=>setTimeout(resolve,25*(index+1)));
    }
  }
}
