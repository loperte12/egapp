const fs=require("fs");
const j=JSON.parse(fs.readFileSync("D:\\egapp\\.auditoria-servicios\\dewu-api\\category_details.json","utf8"));
console.log("claves de nivel 1:", Object.keys(j).join(", "));
console.log("code/status:", j.code, j.status);
const d=j.data||{};
console.log("claves de data:", Object.keys(d).join(", "));
const list = d.list || [];
console.log("elementos en data.list:", Array.isArray(list)?list.length:"no es array");
if (Array.isArray(list) && list.length) {
  console.log("claves del primer elemento:", Object.keys(list[0]).join(", "));
  console.log("primer elemento (recortado):", JSON.stringify(list[0]).slice(0,400));
  // Ver si es un arbol anidado
  const conHijos = list.filter(x => Array.isArray(x.subList) || Array.isArray(x.children) || Array.isArray(x.subs));
  console.log("elementos con hijos:", conHijos.length);
}
