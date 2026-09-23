const fs=require("fs");
const spec=JSON.parse(fs.readFileSync("D:\\egapp\\.auditoria-servicios\\dewu-api\\openapi-poizon.json","utf8"));
const S=(spec.components||{}).schemas||{};
for (const n of ['SpuItem','SaleProperty','SkuTypeGuard','SizeInfoItem','SizeTemplate','Brand','Category','CertScanInfo','LastSoldGuard','FavoriteCountGuard','PriceGuard']) {
  const m=S[n]; if(!m){ console.log("(no existe "+n+")"); continue; }
  const p=m.properties||{};
  console.log("=== "+n+" ("+Object.keys(p).length+" campos) ===");
  for (const k of Object.keys(p)) {
    const d=p[k]; const t=d.type||(d.$ref?String(d.$ref).split("/").pop():(d.items?"array":(d.allOf?"allOf":"?")));
    console.log("  "+k.padEnd(26)+" "+String(t).padEnd(14)+(d.description?" — "+String(d.description).replace(/\s+/g," ").slice(0,50):""));
  }
  console.log("");
}
