const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const res=await fetch(`${API}/lifebook/commerce/orders/5d24f1de-4c7c-4f92-9b54-1bb5fed94066/action`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${r.accessToken}`},body:JSON.stringify({action:'cancel'})});
 const b=await j(res);
 console.log('cancelar HTTP',res.status,'?',b.order?.status, b.error?.code??'');
})();
