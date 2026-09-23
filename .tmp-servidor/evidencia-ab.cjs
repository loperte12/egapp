const API='https://hk.egrouteplan.com/wallet/api/v1';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t||'{}')}catch{return{crudo:t.slice(0,200)}}};
(async()=>{
 const A='ec7d4cb7-22d8-4a84-8337-89af276eb55f'; // tienda de prueba (Hotel Demo Malabo)
 const card=await j(await fetch(`${API}/lifebook/commerce/users/${A}/shop-card`));
 console.log('A) tarjeta de tienda:', card.shop ? `?${card.shop.name}? ? verificada=${card.shop.isVerified} ? ?=${card.shop.rating ?? 'sin rese?as'} ? destacados=${(card.shop.featured??[]).length}` : '(sin tienda)');
 const shopId=card.shop?.id;
 if(shopId){
   const cats=await j(await fetch(`${API}/lifebook/commerce/shops/${shopId}/categories`));
   console.log('B) categor?as de la tienda:', (cats.categories??[]).map(c=>`${c.name}(${c.count})`).join(', ')||'(ninguna)');
   const prods=await j(await fetch(`${API}/lifebook/commerce/shops/${shopId}/products?limit=4`));
   console.log('B) rejilla de la tienda:', (prods.items??[]).length,'productos ? primero:', prods.items?.[0]?.title, '? descCorta:', JSON.stringify(prods.items?.[0]?.shortDescription ?? null));
 }
})();
