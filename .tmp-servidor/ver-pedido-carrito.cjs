const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const cart=await j(await fetch(`${API}/lifebook/commerce/my/cart`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('carrito tras pagar ?', cart.lines, 'l?neas ?', cart.count, 'uds ?', cart.totalXaf, 'XAF');
 const mine=await j(await fetch(`${API}/lifebook/commerce/orders/mine?side=buyer`,{headers:{Authorization:`Bearer ${tok}`}}));
 const o=(mine.orders??[]).find(x=>x.code==='LB-260914-0007');
 console.log('pedido', o?.code, '?', o?.status, '?', o?.itemsCount, 'art?culos ?', o?.totalXaf, 'XAF ?', o?.shop?.name, '? nota:', JSON.stringify(o?.note));
 if(o){ const det=await j(await fetch(`${API}/lifebook/commerce/orders/${o.id}`,{headers:{Authorization:`Bearer ${tok}`}}));
   console.log('l?neas:', (det.order?.items??[]).map(i=>`${i.quantity}? ${i.titleSnapshot} (${i.variantSnapshot??'?'})`).join(' | '));
   console.log('entrega:', det.order?.deliveryMode, '| pago:', det.order?.paymentMethod);
 }
})();
