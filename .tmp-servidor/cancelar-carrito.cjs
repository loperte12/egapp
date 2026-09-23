const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${tok}`}}));
 const o=(mine.orders??[]).find(x=>x.code==='LB-260914-0007');
 const res=await j(await fetch(`${API}/lifebook/commerce/orders/${o.id}/action`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({action:'cancel'})}));
 console.log('cancelar LB-260914-0007 ?', res.order?.status ?? res.error?.code);
})();
