const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,300)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240555000003',password:'123456'})}));
 const tok=r.accessToken;
 const p=await fetch(`${API}/lifebook/commerce/products/d47de72c-bf3e-4701-9535-e85f6f52d74b`,{headers:{Authorization:`Bearer ${tok}`}});
 console.log('GET ficha ?', p.status);
 const pb=await j(p);
 console.log('claves product:', pb.product ? Object.keys(pb.product).slice(0,18).join(', ') : JSON.stringify(pb).slice(0,300));
 console.log('stockQuantity:', pb.product?.stockQuantity, '| watching:', pb.product?.watching);
 const c=await fetch(`${API}/lifebook/commerce/my/cart`,{headers:{Authorization:`Bearer ${tok}`}});
 console.log('GET carrito ?', c.status, JSON.stringify(await j(c)).slice(0,300));
})();
