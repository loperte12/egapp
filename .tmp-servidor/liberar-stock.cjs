const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 // El comprador del pedido LB-260914-0003 es el usuario del tel?fono (ADMIN): puede cancelarlo y
 // as? la unidad que reten?a mi prueba vuelve al stock de la variante.
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const res=await fetch(`${API}/lifebook/commerce/orders/0b678791-a9d7-44df-99c7-9579b332b50e/action`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({action:'cancel'})});
 const b=await j(res);
 console.log('cancelar LB-260914-0003 ? HTTP',res.status,'estado',b.order?.status, b.error?.code??'');
})();
