const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const adm=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const res=await j(await fetch(`${API}/lifebook/commerce/admin/products/d47de72c-bf3e-4701-9535-e85f6f52d74b`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${adm.accessToken}`},body:JSON.stringify({action:'approve'})}));
 console.log('aprobar el producto que qued? en revisi?n ?', JSON.stringify(res).slice(0,160));
 const b=await j(await fetch(`${API}/lifebook/commerce/products/d47de72c-bf3e-4701-9535-e85f6f52d74b`,{headers:{Authorization:`Bearer ${adm.accessToken}`}}));
 console.log('estado ahora:', b.product?.status ?? b.error?.code, '| stock', b.product?.stockQuantity, '| watching', b.product?.watching);
})();
