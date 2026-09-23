const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
(async()=>{
 for (const [tel,nombre] of [['+240999888777','ADMIN (tel?fono)'],['+240555000003','BERNARDO']]) {
   const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:tel,password:'123456'})}));
   const tok=r.accessToken;
   const cart=await j(await fetch(`${API}/lifebook/commerce/my/cart`,{headers:{Authorization:`Bearer ${tok}`}}));
   const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${tok}`}}));
   const abiertos=(mine.orders??[]).filter(o=>['created','confirmed','preparing','in_transit','ready_pickup'].includes(o.status));
   console.log(`${nombre}: carrito ${cart.lines??0} l?neas ? pedidos abiertos: ${abiertos.length}${abiertos.length?' ? '+abiertos.map(o=>`${o.code}(${o.status})`).join(', '):''}`);
 }
})();
