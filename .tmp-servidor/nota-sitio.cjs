const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{}}};
(async()=>{
 const r=await j(await fetch(`${API}/mobility/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+240999888777',password:'123456'})}));
 const tok=r.accessToken;
 // Una nota CON SITIO en el centro de Malabo, publicada por el propio usuario del tel?fono
 const crea=await j(await fetch(`${API}/lifebook/posts`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({
   title:'Caf? con sitio (prueba Ciudad)',
   body:'Nota de prueba con un sitio exacto para ver la distancia en la secci?n Ciudad.',
   city:'Malabo', visibility:'public',
   placeName:'Catedral de Santa Isabel, Malabo', placeLat:3.7522, placeLng:8.7745,
 })});
 console.log('nota con sitio ?', crea.id ?? JSON.stringify(crea).slice(0,160));
 const feed=await j(await fetch(`${API}/lifebook/posts/feed?channel=nearby&city=Malabo&limit=5`,{headers:{Authorization:`Bearer ${tok}`}}));
 console.log('Ciudad (toda) ?', (feed.posts??[]).length, 'notas ? la primera:', feed.posts?.[0]?.title, '| sitio:', feed.posts?.[0]?.placeName);
 console.log('ID_NOTA=' + (crea.id ?? ''));
})();
