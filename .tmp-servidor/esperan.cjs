const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
const login=async(phone,password)=>{const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})}));return r.accessToken};
(async()=>{
 const adm=await login('+240999888777','123456');
 const ber=await login('+240555000003','123456');
 // Un producto de ADMIN (la tienda del tel?fono) que est? publicado
 const suyos=await j(await fetch(`${API}/lifebook/commerce/my/products`,{headers:{Authorization:`Bearer ${adm}`}}));
 const p=(suyos.items??[]).find(x=>x.status==='active');
 console.log('producto de ADMIN:', p?.id, p?.title, '| stock', p?.stockQuantity, '| esperan', p?.waitingCount);
 // Se deja sin stock desde el panel (camino del comerciante) y BERNARDO pide el aviso
 const q=await j(await fetch(`${API}/lifebook/merchant/products/${p.id}/quick`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${adm}`},body:JSON.stringify({stockQuantity:0})}));
 console.log('a 0 desde el panel ?', q.stockQuantity ?? q.error?.code);
 const w=await j(await fetch(`${API}/lifebook/commerce/products/${p.id}/interest`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ber}`},body:JSON.stringify({})}));
 console.log('BERNARDO pide el aviso ?', JSON.stringify(w));
 const lista=await j(await fetch(`${API}/lifebook/commerce/my/products`,{headers:{Authorization:`Bearer ${adm}`}}));
 const p2=(lista.items??[]).find(x=>x.id===p.id);
 console.log('en el panel de ADMIN ? waitingCount:', p2?.waitingCount);
 const ficha=await j(await fetch(`${API}/lifebook/commerce/products/${p.id}`,{headers:{Authorization:`Bearer ${adm}`}}));
 console.log('en la ficha (due?o) ? waitingCount:', ficha.product?.waitingCount, '| isMine', ficha.product?.isMine);
 const fichaB=await j(await fetch(`${API}/lifebook/commerce/products/${p.id}`,{headers:{Authorization:`Bearer ${ber}`}}));
 console.log('en la ficha (comprador) ? waitingCount:', fichaB.product?.waitingCount, fichaB.error?.code ?? '');
 console.log('ID=' + p.id);
})();
