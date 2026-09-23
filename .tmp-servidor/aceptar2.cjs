const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240222000123',password:'MiClave123'})}));
 const res=await fetch(`${API}/lifebook/commerce/orders/5d24f1de-4c7c-4f92-9b54-1bb5fed94066/action`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${r.accessToken}`},body:JSON.stringify({action:'accept'})});
 console.log('HTTP',res.status,(await res.text()).slice(0,120));
})();
