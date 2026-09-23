const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,300)}}};
(async()=>{
 const adm=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=adm.accessToken;
 const GRUPO='c809aac1-1c80-454d-aa49-2c9e925e229f'; // ?Prueba tarjeta producto? (ADMIN + A)
 const prod=await j(await fetch(`${API}/lifebook/commerce/products/9a4b6a09-0000-0000-0000-000000000000`,{headers:{Authorization:`Bearer ${tok}`}}));
 // el producto se busca por cat?logo: el mismo que usa la ficha del chat
 const cat=await j(await fetch(`${API}/lifebook/commerce/catalog?q=Producto%20pedidos&limit=5`,{headers:{Authorization:`Bearer ${tok}`}}));
 const items=cat.items??cat.products??[];
 const p=items.find(x=>/Producto pedidos/.test(x.title));
 console.log('producto', p?.id, p?.title, p?.priceXaf);
 const ficha=(await j(await fetch(`${API}/lifebook/commerce/products/${p.id}`,{headers:{Authorization:`Bearer ${tok}`}}))).product;
 const pago=(ficha.paymentMethods??[]).find(m=>m.status==='active')?.method;
 const vari=(ficha.variants??[])[0];
 const clave='lb53a-grupo-'+Date.now();
 const res=await j(await fetch(`${API}/lifebook/commerce/orders`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`,'Idempotency-Key':clave},body:JSON.stringify({items:[{productId:ficha.id,variantId:vari?.id??null,quantity:1}],deliveryMode:'pickup',deliveryAddress:{},paymentMethod:pago,conversationId:GRUPO})}));
 console.log('pedido', res.order?.id, res.order?.code, res.order?.status, 'pago', pago, 'variante', vari?.name);
})();
