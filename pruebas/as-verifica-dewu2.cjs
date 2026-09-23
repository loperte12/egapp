const fs=require("fs");
const spec=JSON.parse(fs.readFileSync("D:\\egapp\\.auditoria-servicios\\dewu-api\\openapi-poizon.json","utf8"));
const S=(spec.components||{}).schemas||{};
const raw=JSON.stringify(S);
for (const target of ["SaleProperty","Property","SizeInfoItem","SizeTemplate","PriceItem","SpuItem"]) {
  const usos=[];
  for (const [n,m] of Object.entries(S)) {
    if (n===target) continue;
    if (JSON.stringify(m).includes('"#/components/schemas/'+target+'"')) usos.push(n);
  }
  console.log(target+" -> usado por: "+(usos.length?usos.join(", "):"(nadie)"));
}
const P=(S.Property||{}).properties||{};
console.log("");
console.log("=== Property ("+Object.keys(P).length+" campos) ===");
for (const k of Object.keys(P)) { const d=P[k]; console.log("  "+k.padEnd(22)+" "+(d.type||(d.$ref?String(d.$ref).split("/").pop():""))); }
