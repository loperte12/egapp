const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const f=await j(await fetch(`${API}/lifebook/commerce/products/d47de72c-bf3e-4701-9535-e85f6f52d74b`,{headers:{Authorization:`Bearer ${tok}`}}));
 const v=(f.product?.variants??[])[0];
 const add=await j(await fetch(`${API}/lifebook/commerce/my/cart`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({productId:'d47de72c-bf3e-4701-9535-e85f6f52d74b',...(v?.id?{variantId:v.id}:{}),quantity:1})}));
 console.log('a?adido al carrito de ADMIN ?', add.count, 'uds ?', add.lines, 'l?neas');
 const g=(add.groups??[])[0];
 console.log('grupo:', g?.shop?.name, '| llega a tu zona:', g?.shipsToBuyer, '| aviso:', g?.shippingWarning, '| entregas:', (g?.deliveryModes??[]).join(','));
})();
