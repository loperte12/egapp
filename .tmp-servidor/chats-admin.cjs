const API='https://hk.egrouteplan.com/wallet/api/v1';
(async()=>{
 const r=await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})});
 const {accessToken:tok}=await r.json();
 const list=await (await fetch(`${API}/lifebook/chat/conversations`,{headers:{Authorization:`Bearer ${tok}`}})).json();
 const A='ec7d4cb7-22d8-4a84-8337-89af276eb55f';
 for(const c of (Array.isArray(list)?list:list.conversations??[])){
   if(c.kind!=='group' && c.other?.id===A) console.log('DIRECTO con A =',c.id,'| last:',String(c.lastMessage||'').slice(0,50),'|',c.lastMessageAt);
 }
 console.log('--- todos ---');
 for(const c of (Array.isArray(list)?list:[])) console.log(c.kind,'|',(c.title??c.other?.fullName),'|',c.id,'|',String(c.lastMessage||'').slice(0,40));
})();
