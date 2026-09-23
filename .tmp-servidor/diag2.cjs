const API='https://hk.egrouteplan.com/wallet/api/v1';
(async()=>{
 const r=await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240555000003',password:'123456'})});
 const {accessToken:tok}=await r.json();
 const res=await fetch(`${API}/lifebook/chat/conversations`,{headers:{Authorization:`Bearer ${tok}`}});
 console.log('HTTP',res.status);
 console.log((await res.text()).slice(0,600));
})();
