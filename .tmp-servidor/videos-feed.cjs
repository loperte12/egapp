const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 for (const q of ['type=video&limit=10','channel=nearby&city=Malabo&limit=10','channel=for_you&limit=10','channel=following&limit=10']) {
   const res=await j(await fetch(`${API}/lifebook/posts/feed?${q}`,{headers:{Authorization:`Bearer ${tok}`}}));
   const items=res.posts??res.items??[];
   console.log('---',q,'?',items.length,'posts');
   for(const p of items.slice(0,4)) console.log('   ',p.type,'|',String(p.title||p.body||'').slice(0,40),'|',p.payload?.videoUrl??p.videoUrl??'(sin url)');
 }
})();
