const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240222000123',password:'MiClave123'})}));
 const tok=r.accessToken;
 const s=await j(await fetch(`${API}/lifebook/commerce/my/shop`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('tienda:', s.shop?.name, '? ciudad:', s.shop?.city, '? regi?n:', s.shop?.region);
 console.log('pol?tica:', JSON.stringify(s.shop?.shippingPolicy));
})();
