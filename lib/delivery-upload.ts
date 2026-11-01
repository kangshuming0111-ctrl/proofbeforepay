import {assertStaticPath,encodeRasterDataUrl,STATIC_RESOURCE_LIMITS as limits,staticFileKind} from './static-resources.ts';
export type BrowserDeliveryFile={name:string;size:number;webkitRelativePath?:string;arrayBuffer:()=>Promise<ArrayBuffer>};
/** Remove only the selected local folder root; package paths remain unchanged. */
export function deliveryUploadPath(file:Pick<BrowserDeliveryFile,'name'|'webkitRelativePath'>):string {
 const relative=file.webkitRelativePath;
 return assertStaticPath(relative?relative.slice(relative.indexOf('/')+1):file.name);
}
export async function readDeliveryUpload(selected:BrowserDeliveryFile[]):Promise<Record<string,string>>{
 if(!selected.length||selected.length>limits.maxFiles)throw new Error('Choose 1–40 static delivery files.');
 const roots=new Set(selected.filter(x=>x.webkitRelativePath).map(x=>x.webkitRelativePath!.split('/')[0]));
 if(roots.size>1||roots.size&&selected.some(x=>!x.webkitRelativePath))throw new Error('Select one complete project folder or individual files, not a mixture.');
 const files:Record<string,string>={},names=new Set<string>();let textBytes=0,rasterBytes=0;
 for(const file of selected){
  const path=deliveryUploadPath(file),kind=staticFileKind(path),name=path.toLowerCase();
  if(!kind)throw new Error(`Unsupported delivery file: ${path}. Use HTML, CSS, PNG, JPEG or WebP.`);
  if(names.has(name))throw new Error(`Duplicate or case-conflicting path: ${path}.`);names.add(name);
  const raster=kind!=='html'&&kind!=='css';
  if(file.size>(raster?limits.rasterFileBytes:limits.textFileBytes))throw new Error(`${path} exceeds the ${raster?'256':'64'} KiB file limit.`);
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(raster){rasterBytes+=bytes.length;files[path]=encodeRasterDataUrl(path,bytes);}else{
   textBytes+=bytes.length;if(bytes.length>limits.textFileBytes)throw new Error(`${path} exceeds the text file limit.`);
   try{files[path]=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error(`${path} must use UTF-8 text.`);}
  }
  if(textBytes>limits.textTotalBytes||rasterBytes>limits.rasterTotalBytes)throw new Error('The package exceeds 256 KiB of text or 1 MiB of images.');
 }
 if(!Object.hasOwn(files,'index.html'))throw new Error('Include index.html at the project root.');
 return files;
}
export function deliveryFileUrl(quoteId:string,deliveryId:string,file:string,archived=false):string{
 assertStaticPath(file);
 return `/${archived?'proof-versions':'deliveries'}/${encodeURIComponent(quoteId)}/${encodeURIComponent(deliveryId)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}
export function isHtmlDeliveryPath(value:string):boolean{try{return staticFileKind(assertStaticPath(value))==='html';}catch{return false;}}
