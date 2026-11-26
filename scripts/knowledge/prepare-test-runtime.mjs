// The OCR raster integration test uses the same Poppler runtime as the image.
// Provision this explicit test dependency on GitHub's disposable Linux runner;
// local machines should install it themselves. Product startup never runs this.
import {spawnSync,execFileSync} from "node:child_process";

if(spawnSync("pdftoppm",["-v"],{stdio:"ignore",windowsHide:true}).status!==0){
  if(process.env.CI!=="true"||process.platform!=="linux"){
    throw Error("PDF raster tests require pdftoppm (Poppler). Install it before running the complete test suite.");
  }
  execFileSync("sudo",["apt-get","update","-qq"],{stdio:"inherit",timeout:120000});
  execFileSync("sudo",["apt-get","install","-y","--no-install-recommends","poppler-utils"],{stdio:"inherit",timeout:120000});
}
