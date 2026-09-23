const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const adm=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${adm.accessToken}`}}));
 for(const o of (mine.orders??[]).slice(0,8)) console.log(o.id, o.code, o.status, o.totalXaf, o.createdAt, '|', o.title);
})();
