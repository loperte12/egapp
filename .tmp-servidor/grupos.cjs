const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const list=await j(await fetch(`${API}/lifebook/chat/conversations`,{headers:{Authorization:`Bearer ${tok}`}}));
 const g=(Array.isArray(list)?list:[]).filter(c=>c.kind==='group' && /Prueba|Ruta del mirador|Eg route plan|EG route plan/i.test(String(c.title||'')));
 for(const c of g){
   const d=await j(await fetch(`${API}/lifebook/groups/${c.id}`,{headers:{Authorization:`Bearer ${tok}`}}));
   console.log(c.id,'|',c.title,'| miembros:',(d.members??[]).map(m=>m.fullName).join(', '),'| rol:',d.myRole);
 }
})();
