const fs=require("fs");
const D="D:\\egapp\\.auditoria-servicios\\mall\\";
const citas=[
 ["OmsPortalOrderController.java","generateConfirmOrder","endpoint de confirmacion"],
 ["OmsPortalOrderController.java","generateOrder","creacion del pedido"],
 ["OmsPortalOrderController.java","cancelTimeOutOrder","barrido de caducados"],
 ["OmsPortalOrderController.java","sendDelayMessageCancelOrder","mensaje retardado"],
 ["OmsPortalOrderController.java","confirmReceiveOrder","confirmar recepcion"],
 ["OmsPortalOrderController.java","deleteOrder","quitar de la vista"],
 ["OmsPortalOrderController.java","0->待付款","los cinco estados"],
 ["OmsCartItemController.java","list/promotion","carrito con promociones"],
 ["OmsCartItemController.java","update/attr","cambiar variante desde el carrito"],
 ["OmsCartItemController.java","getProduct/{productId}","traer opciones para reseleccionar"],
 ["OmsCartItemController.java","/clear","vaciar carrito"],
 ["HomeController.java","recommendProductList","recomendados"],
 ["HomeController.java","hotProductList","populares"],
 ["HomeController.java","newProductList","novedades"],
 ["PmsPortalProductController.java","综合搜索、筛选、排序","busqueda+filtro+orden"],
 ["PmsPortalProductController.java","categoryTreeList","arbol de categorias"],
 ["PmsPortalBrandController.java","recommendList","marcas recomendadas"],
 ["PmsPortalBrandController.java","productList","productos de una marca"],
 ["OmsPortalOrderReturnApplyController.java","申请退货","solicitud de devolucion"],
];
let ok=0, mal=0;
for (const [f,txt,desc] of citas) {
  const p=D+f;
  if (!fs.existsSync(p)) { console.log("FALTA FICHERO "+f); mal++; continue; }
  const c=fs.readFileSync(p,"utf8");
  if (c.includes(txt)) { ok++; } else { console.log("MAL  "+f+" no contiene: "+txt+"  ("+desc+")"); mal++; }
}
console.log("citas verificadas: "+ok+" · fallidas: "+mal);
