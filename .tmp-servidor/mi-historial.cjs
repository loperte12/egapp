const API='https://hk.egrouteplan.com/wallet/api/v1';
(async()=>{
 const r=await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})});
 const {accessToken:tok}=await r.json();
 const me=await (await fetch(`${API}/mobility/auth/me`,{headers:{Authorization:`Bearer ${tok}`}})).json();
 console.log('id',me.id,'?',me.fullName);
 const h=await (await fetch(`${API}/lifebook/commerce/my/views?limit=10`,{headers:{Authorization:`Bearer ${tok}`}})).json();
 for(const x of (h.items??[])) console.log('  visto:',x.title,'|',x.viewedAt,'| times',x.times,'| disponible',x.available,'| tienda',x.shop?.name);
})();
