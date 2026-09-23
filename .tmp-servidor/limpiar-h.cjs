const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
const login=async(phone,password)=>{const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})}));return r.accessToken};
const ID='c05d515e-ca6e-4cdb-8fb7-d676f32d93ed';
(async()=>{
 const adm=await login('+240999888777','123456');
 const ber=await login('+240555000003','123456');
 const q=await j(await fetch(`${API}/lifebook/merchant/products/${ID}/quick`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${adm}`},body:JSON.stringify({stockMode:'unlimited',stockQuantity:0})}));
 const un=await j(await fetch(`${API}/lifebook/commerce/products/${ID}/interest`,{method:'DELETE',headers:{Authorization:`Bearer ${ber}`}}));
 const l=await j(await fetch(`${API}/lifebook/commerce/my/products`,{headers:{Authorization:`Bearer ${adm}`}}));
 console.log('limpieza ? modo:', q.stockMode, '| esperas quitadas:', un.quitadas, '| waitingCount:', (l.items??[]).find(x=>x.id===ID)?.waitingCount);
 const un2=await j(await fetch(`${API}/lifebook/commerce/products/1e0ff38e-2ae4-4ee3-82ce-1c99dabc7e29/interest`,{method:'DELETE',headers:{Authorization:`Bearer ${adm}`}}));
 console.log('espera del servicio quitada:', un2.quitadas);
})();
