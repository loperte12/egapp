const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240222000123',password:'MiClave123'})}));
 const tok=r.accessToken;
 const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=seller`,{headers:{Authorization:`Bearer ${tok}`}}));
 const o=(mine.orders??[]).find(x=>x.code==='LB-260914-0003');
 console.log('pedido',o?.id, o?.code, o?.status, '?', o?.buyer?.name);
 if(!o) process.exit(1);
 const acc=await j(await fetch(`${API}/lifebook/commerce/orders/${o.id}/action`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({action:'accept'})}));
 console.log('aceptar ?', JSON.stringify(acc).slice(0,200));
})();
