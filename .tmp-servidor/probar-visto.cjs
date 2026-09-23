const API='https://hk.egrouteplan.com/wallet/api/v1';
(async()=>{
 const r=await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})});
 const {accessToken:tok}=await r.json();
 const res=await fetch(`${API}/lifebook/commerce/products/d47de72c-bf3e-4701-9535-e85f6f52d74b`,{headers:{Authorization:`Bearer ${tok}`}});
 const b=await res.json();
 console.log('HTTP',res.status,'| isMine',b.product?.isMine,'| vistas',b.product?.viewsCount);
 const h=await (await fetch(`${API}/lifebook/commerce/my/views?limit=5`,{headers:{Authorization:`Bearer ${tok}`}})).json();
 console.log('historial ADMIN:',JSON.stringify(h).slice(0,200));
})();
