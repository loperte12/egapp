const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 const feed=await j(await fetch(`${API}/lifebook/posts/feed?type=video&limit=10`,{headers:{Authorization:`Bearer ${tok}`}}));
 for(const p of (feed.posts??[]).slice(0,4)){
   const pr=await j(await fetch(`${API}/lifebook/posts/${p.id}/products`));
   console.log(p.id,'|',String(p.title||'').slice(0,32),'| productos:',(pr.products??[]).map(x=>x.title).join(', ')||'(ninguno)');
 }
})();
