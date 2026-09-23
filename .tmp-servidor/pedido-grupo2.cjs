const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,300)}}};
(async()=>{
 const adm=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=adm.accessToken;
 const GRUPO='c809aac1-1c80-454d-aa49-2c9e925e229f';
 const r=await fetch(`${API}/lifebook/commerce/orders`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`,'Idempotency-Key':'lb53a-grupo-2-'+Date.now()},body:JSON.stringify({items:[{productId:'d47de72c-bf3e-4701-9535-e85f6f52d74b',variantId:null,quantity:1}],deliveryMode:'pickup',deliveryAddress:{},paymentMethod:'billing',conversationId:GRUPO})});
 console.log('HTTP',r.status);
 console.log((await r.text()).slice(0,400));
})();
