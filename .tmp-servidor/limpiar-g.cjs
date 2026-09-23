const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const un=await j(await fetch(`${API}/lifebook/commerce/products/1e0ff38e-2ae4-4ee3-82ce-1c99dabc7e29/interest`,{method:'DELETE',headers:{Authorization:`Bearer ${tok}`}}));
 const vac=await j(await fetch(`${API}/lifebook/commerce/my/cart`,{method:'DELETE',headers:{Authorization:`Bearer ${tok}`}}));
 const f=await j(await fetch(`${API}/lifebook/commerce/products/1e0ff38e-2ae4-4ee3-82ce-1c99dabc7e29`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('limpieza ? espera quitada:', un.quitadas, '| carrito:', vac.lines, 'l?neas | watching ahora:', f.product?.watching);
})();
