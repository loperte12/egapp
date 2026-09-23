const fs=require("fs");
const spec=JSON.parse(fs.readFileSync("D:\\egapp\\.auditoria-servicios\\dewu-api\\openapi-poizon.json","utf8"));
const S=(spec.components||{}).schemas||{};
console.log("endpoints:", Object.keys(spec.paths||{}).length, "| modelos:", Object.keys(S).length);
const must=["SpuItem","SaleProperty","SkuTypeGuard","SizeTemplate","Brand","CertScanInfo","LastSoldGuard","FavoriteCountGuard","PriceItem","Category"];
for(const n of must) console.log("  "+(S[n]?"OK   ":"FALTA")+" "+n+(S[n]?" ("+Object.keys(S[n].properties||{}).length+" campos)":""));
// la afirmacion delicada: SkuTypeGuard.properties apunta a SaleProperty?
const p=(S.SkuTypeGuard||{}).properties||{};
console.log("SkuTypeGuard.properties ->", JSON.stringify(p.properties));
console.log("authPrice presente:", !!(p.authPrice));
const c=JSON.parse(fs.readFileSync("D:\\egapp\\.auditoria-servicios\\dewu-api\\category.json","utf8"));
console.log("categorias de primer nivel:", c.data.list.length);
const cd=JSON.parse(fs.readFileSync("D:\\egapp\\.auditoria-servicios\\dewu-api\\category_details.json","utf8"));
console.log("marcas:", cd.data.list.length, "| claves:", Object.keys(cd.data.list[0]).join(","));
console.log("primera marca:", JSON.stringify(cd.data.list[0].brand).slice(0,120));
