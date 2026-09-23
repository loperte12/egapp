const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,300)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240222000123',password:'MiClave123'})}));
 const tok=r.accessToken;
 const s=await j(await fetch(`${API}/lifebook/commerce/my/shop`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('claves de shop:', Object.keys(s.shop ?? {}).join(', '));
 console.log(JSON.stringify(s.shop?.shipping ?? s.shop?.shippingPolicy ?? s.shop?.shipping_policy ?? null).slice(0,400));
})();
