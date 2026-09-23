const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
const login=async(phone,password)=>{const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})}));return r.accessToken};
const ID='c05d515e-ca6e-4cdb-8fb7-d676f32d93ed';
(async()=>{
 const adm=await login('+240999888777','123456');
 const ber=await login('+240555000003','123456');
 const q=await j(await fetch(`${API}/lifebook/merchant/products/${ID}/quick`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${adm}`},body:JSON.stringify({stockMode:'exact',stockQuantity:0})}));
 console.log('existencias exactas a 0 ?', q.stockMode, q.stockQuantity, q.error?.code ?? '');
 const w=await j(await fetch(`${API}/lifebook/commerce/products/${ID}/interest`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ber}`},body:JSON.stringify({})}));
 console.log('BERNARDO pide el aviso ?', JSON.stringify(w));
 const lista=await j(await fetch(`${API}/lifebook/commerce/my/products`,{headers:{Authorization:`Bearer ${adm}`}}));
 console.log('panel de ADMIN ? waitingCount:', (lista.items??[]).find(x=>x.id===ID)?.waitingCount);
 const ficha=await j(await fetch(`${API}/lifebook/commerce/products/${ID}`,{headers:{Authorization:`Bearer ${adm}`}}));
 console.log('ficha del due?o ? waitingCount:', ficha.product?.waitingCount);
})();
