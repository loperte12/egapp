const API='https://hk.egrouteplan.com/wallet/api/v1';
(async()=>{
 const cat=await (await fetch(`${API}/lifebook/commerce/catalog?sort=recent&limit=20`)).json();
 for(const p of (cat.items??[])) console.log(p.id,'|',p.title,'|',p.priceXaf,'|',p.priceMode,'|',p.stockMode,p.stockQuantity,'|',p.shop.name);
})();
