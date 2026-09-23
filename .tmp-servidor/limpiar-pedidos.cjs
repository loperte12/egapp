const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240555000003',password:'123456'})}));
 const tok=r.accessToken;
 const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${tok}`}}));
 const abiertos=(mine.orders??[]).filter(o=>['created','confirmed','preparing'].includes(o.status));
 let ok=0, no=0;
 for (const o of abiertos) {
   const res=await fetch(`${API}/lifebook/commerce/orders/${o.id}/action`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({action:'cancel'})});
   if (res.ok) ok++; else { no++; const b=await j(res); if(no<=3) console.log('  no se pudo', o.code, b.error?.code); }
 }
 console.log(`pedidos de prueba cancelados: ${ok} ? fallos: ${no}`);
 const despues=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('quedan abiertos:', (despues.orders??[]).filter(o=>['created','confirmed','preparing','in_transit','ready_pickup'].includes(o.status)).length);
})();
