const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('ADMIN ? pedidos abiertos:', (mine.orders??[]).filter(o=>['created','confirmed','preparing','in_transit','ready_pickup'].includes(o.status)).length);
 const cat=await j(await fetch(`${API}/lifebook/commerce/catalog?limit=6`,{headers:{Authorization:`Bearer ${tok}`}}));
 for(const p of (cat.items??[]).slice(0,6)) console.log('  ', p.title, '|', p.priceXaf ?? 'a consultar', '|', p.stockMode, p.stockQuantity);
})();
