const fs=require('fs'); const {JSDOM}=require('jsdom');
process.on('unhandledRejection',()=>{});
const bundle=fs.readFileSync('.auditoria-servicios/web-admin/web-admin/assets/index-CheeN-IO.js','utf8');
const mio=fs.readFileSync('.auditoria-servicios/web-admin/ecomerse-docs.js','utf8');
(async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{url:'https://hk.egrouteplan.com/admin/ecomerse-docs',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window; w.localStorage.setItem('unified_token','t');
  ['log','info','warn','error','debug'].forEach(n=>{w.console[n]=()=>{}});
  w.fetch=()=>Promise.resolve({ok:true,status:200,json:()=>Promise.resolve([]),text:()=>Promise.resolve('[]')});
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
  w.eval(mio);
  await new Promise(r=>setTimeout(r,1000));
  console.log('1s sin bundle  -> ticks:', w.__ticks, '| ultimo:', JSON.stringify(w.__ultimoIntento), '| capa:', !!w.document.getElementById('ecomerse-docs-root'));
  w.eval(bundle);
  await new Promise(r=>setTimeout(r,2000));
  console.log('2s con bundle  -> ticks:', w.__ticks, '| ultimo:', JSON.stringify(w.__ultimoIntento), '| capa:', !!w.document.getElementById('ecomerse-docs-root'));
  process.exit(0);
})();
