const fs=require('fs'); const {JSDOM}=require('jsdom');
process.on('unhandledRejection',()=>{});
const bundle=fs.readFileSync('.auditoria-servicios/web-admin/web-admin/assets/index-CheeN-IO.js','utf8');
const mio=fs.readFileSync('.auditoria-servicios/web-admin/ecomerse-docs.js','utf8');
(async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{url:'https://hk.egrouteplan.com/admin/ecomerse-docs',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window; w.localStorage.setItem('unified_token','t');
  ['log','info','warn','error','debug'].forEach(n=>{w.console[n]=()=>{}});
  w.fetch=(u)=>{let c=[]; if(/auth\/me/.test(u)) c={data:{user:{fullName:'A',role:'ADMIN'}}}; else if(/metrics/.test(u)) c={pendingOrders:0}; else if(/driver-documents/.test(u)) c={data:{drivers:[]}}; else if(/stats/.test(u)) c={pending:1,approved:0,rejected:0,total:1}; else if(/admin\/docs/.test(u)) c=[{id:'d1',docType:'factura_compra',url:'https://x/f.png',docNumber:'FAC-1',amountXaf:6500,status:'pending',createdAt:'2026-09-18T10:00:00Z',producto:{id:'p1',title:'P4',priceXaf:18500,city:'Malabo',sellerName:'Ab'}}]; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(c),text:()=>Promise.resolve(JSON.stringify(c))});};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
  w.eval(mio);
  console.log('bandera tras mi script:', w.__soyDocs());
  w.eval(bundle);
  for (const t of [300,800,1600,2500]) { await new Promise(r=>setTimeout(r,t===300?300:t-300)); console.log('t='+t+'ms bandera:', w.__soyDocs(), '| capa:', !!w.document.getElementById('ecomerse-docs-root'), '| url:', w.location.pathname); }
  process.exit(0);
})();
