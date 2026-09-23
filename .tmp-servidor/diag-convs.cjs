const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240555000003',password:'123456'})}));
 const tok=r.accessToken;
 const convs=await j(await fetch(`${API}/lifebook/chat/conversations`,{headers:{Authorization:`Bearer ${tok}`}}));
 const list=convs.conversations??[];
 console.log('total conversaciones:',list.length);
 for(const c of list.slice(0,8)) console.log(c.kind,'|',c.title??c.peer?.name,'| peer.id=',c.peer?.id,'| last=',String(c.lastMessage??'').slice(0,40),'| at=',c.lastMessageAt);
})();
