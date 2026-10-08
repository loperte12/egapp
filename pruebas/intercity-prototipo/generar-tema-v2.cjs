// generar-tema-v2.cjs — produce tema-v2.css a partir de tema-actual.css.
//
// Estrategia: NO reescribir (el CSS tiene 224 selectores y perder uno rompe una pantalla).
// Se transforma: se cambia el bloque de tokens, se reescala la tipografía y los radios
// con tablas explícitas, y encima se añade una capa propia con las decisiones de diseño.
// Así el HTML no cambia y la comparación es limpia: misma lógica, otra piel.
const fs = require("fs");
const path = require("path");
const DIR = __dirname;

let css = fs.readFileSync(path.join(DIR, "tema-actual.css"), "utf8");

// --- 1. tokens ---------------------------------------------------------------
const TOKENS = `:root{
    /* SUPERFICIES: tres pasos, sin sombras que ensucien */
    --bg:#0E1116;        /* lienzo del movil */
    --card:#161A21;      /* tarjeta */
    --card2:#1E232B;     /* elevada: campos, chips, botones secundarios */
    --field:#1A1F27;
    --line:#2A313B;
    /* TEXTO: tres niveles. Los tres pasan AA sobre su fondo medido */
    --text:#EEF2F7; --muted:#A7B1BD; --faint:#7E8894;
    /* ACENTOS: uno por significado, sin solapes.
       El ambar NO significa "pendiente": pendiente es esperar, no alarmar. */
    --primary:#1F6FEB;   /* accion y seleccion (blanco encima = 4.63:1) */
    --price:#FFB020;     /* SOLO dinero */
    --ok:#34C77B;        /* validado / cobrado */
    --warn:#FF8A3D;      /* atencion real: avisos, condiciones legales */
    --danger:#E5533D;
    --desc:#FFB020;      /* insignia de descuento */
    /* nombres heredados que el CSS ya usa */
    --price-text:var(--price); --link:#5AA9FF; --ok-text:#3ED489;
    /* RADIOS: tres, no ocho */
    --r-sm:10px; --r-md:14px; --r-lg:20px;
    --r-card:var(--r-lg); --r-btn:var(--r-md); --r-chip:999px; --r-field:var(--r-md);
  }`;
css = css.replace(/:root\{[\s\S]*?\}/, TOKENS);

// --- 2. escala tipográfica: 19 tamaños -> 6 (suelo 13 px, no 8) ---------------
const ESCALA = [[11.5, 13], [12.5, 13], [13.5, 14], [15, 15], [17, 17], [20, 20], [24, 24]];
function reescala(px) {
  const v = Number(px);
  for (const [hasta, nuevo] of ESCALA) if (v <= hasta) return nuevo;
  return v;
}
let cambiosTam = 0;
css = css.replace(/font-size:([\d.]+)px/g, (_, px) => {
  const n = reescala(px);
  if (n !== Number(px)) cambiosTam++;
  return "font-size:" + n + "px";
});

// --- 3. radios: 8 valores -> 3 ------------------------------------------------
const RADIOS = { 8: "var(--r-sm)", 9: "var(--r-sm)", 10: "var(--r-sm)", 11: "var(--r-sm)",
                 12: "var(--r-sm)", 13: "var(--r-md)", 14: "var(--r-md)", 16: "var(--r-lg)" };
let cambiosRadio = 0;
css = css.replace(/border-radius:(\d+)px/g, (_, px) => {
  const n = RADIOS[Number(px)];
  if (!n) return "border-radius:" + px + "px";
  cambiosRadio++;
  return "border-radius:" + n;
});

// --- 4. capa propia -----------------------------------------------------------
const CAPA = `
  /* ══════════════════════════════════════════════════════════════════════
     CAPA v2 — decisiones de diseño. Va al final, así que gana a lo anterior.
     Reglas: un color = un significado · el dinero no lleva color, lleva
     jerarquía · pendiente es neutro (esperar no es una alarma).
     ══════════════════════════════════════════════════════════════════════ */

  /* Marco: borde de 1px, sin la sombra difusa anterior */
  .movil{border:1px solid var(--line);border-radius:26px;box-shadow:0 20px 60px rgba(0,0,0,.55)}

  /* Barra superior: más aire y título con peso real */
  .topbar{height:60px;padding:0 18px}
  .topbar .titulo{font-size:17px;font-weight:700;letter-spacing:-.01em}
  .topbar .back{font-size:22px;color:var(--muted)}
  .topbar .avatar{width:34px;height:34px;font-size:12px}

  /* Contenido con ritmo constante */
  .contenido{padding:18px;gap:14px}
  .tarjeta{padding:16px;gap:12px;border:1px solid var(--line)}
  .rotulo{font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--faint)}

  /* Campos: más altos y con foco visible (aunque el prototipo no sea interactivo) */
  .campo,.cal-card{height:52px;border:1px solid var(--line);background:var(--field)}
  .campo .valor,.cal-card .v{font-size:15px;font-weight:500}
  .campo.secundario .valor{color:var(--muted)}

  /* Chips: píldora completa, altura táctil */
  .chip{height:40px;padding:0 16px;background:var(--card2);border-color:transparent}
  .chip.sel{background:var(--primary);color:#fff;border-color:transparent}
  .chip.mini{height:30px;padding:0 12px;border-radius:var(--r-chip)}
  .chip.off{color:var(--faint)}

  /* Botones: 52 px, un solo acento, secundario por superficie (no por color) */
  .btn{height:52px;font-size:16px;font-weight:700;border-radius:var(--r-md);background:var(--primary);color:#fff}
  .btn.sec{background:var(--card2);color:var(--text);border:1px solid var(--line)}
  .btn.mini{height:44px;font-size:14px;font-weight:600}
  .acciones{gap:10px}

  /* Píldoras de estado: alto 26, texto 12. «cuando» es NEUTRO */
  .estado{height:26px;padding:0 11px;font-size:12px;font-weight:600;border-radius:var(--r-chip)}
  .estado.ok{background:rgba(52,199,123,.16);color:var(--ok-text)}
  .estado.pend{background:var(--card2);color:var(--muted);border:1px dashed var(--line)}
  .estado.viaje{background:rgba(31,111,235,.20);color:var(--link)}
  .estado.cuando{background:transparent;color:var(--faint);font-weight:500;padding:0}
  .sello{background:rgba(14,17,22,.92);border-radius:var(--r-chip);height:24px}
  .badge-desc{background:rgba(255,176,32,.16);color:var(--desc);height:24px;font-size:12px}

  /* Dinero: jerarquía por tamaño y peso, no por color chillón */
  .precio{color:var(--price);font-weight:800;letter-spacing:-.01em}
  .tachado{color:var(--faint);text-decoration-thickness:1px}
  .plaza{width:46px;height:36px;border-radius:var(--r-sm);font-size:13px;font-weight:600;border-color:var(--line);background:var(--field)}
  .plaza.val{background:rgba(52,199,123,.16);border-color:rgba(52,199,123,.45);color:var(--ok-text)}
  .plaza.ocu{background:rgba(31,111,235,.18);border-color:rgba(31,111,235,.45);color:var(--link)}

  /* Pie: los emoji se sustituyen por iconos monocromos (máscara SVG) */
  .footer{background:var(--card);border-top:1px solid var(--line)}
  .footer .ftab{font-size:12px;padding:10px 0 13px;gap:4px;color:var(--faint)}
  .footer .ftab.sel{color:var(--primary)}
  .footer .ftab .fic{width:22px;height:22px;font-size:0;background:currentColor;
    -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;
    -webkit-mask-size:22px 22px;mask-size:22px 22px}
  .footer .ftab:nth-child(1) .fic{-webkit-mask-image:var(--ic-casa);mask-image:var(--ic-casa)}
  .footer .ftab:nth-child(2) .fic{-webkit-mask-image:var(--ic-ticket);mask-image:var(--ic-ticket)}
  .footer .ftab:nth-child(3) .fic{-webkit-mask-image:var(--ic-ruta);mask-image:var(--ic-ruta)}
  .footer .ftab:nth-child(4) .fic{-webkit-mask-image:var(--ic-panel);mask-image:var(--ic-panel)}
  .footer .ftab:nth-child(5) .fic{-webkit-mask-image:var(--ic-perfil);mask-image:var(--ic-perfil)}

  /* Accesos de contacto y enlaces */
  .accion{background:var(--field);border-color:var(--line);border-radius:var(--r-md);font-size:12px;color:var(--muted)}
  .accion .aic{font-size:18px}
  .sello.ok{color:var(--ok-text)} .sello.pend{color:var(--warn)}
  .nota{font-size:13px;line-height:1.5;color:var(--muted)}
  .nota.legal{border-left:3px solid var(--warn);background:var(--card2);border-radius:var(--r-sm)}
  .amen{height:24px;padding:0 9px;border-radius:var(--r-chip);font-size:12px;background:var(--card2);border-color:transparent}
  .meta.destacada{color:var(--price)}
  .cal .d.desc{color:var(--desc);font-weight:700}
  .resumen{font-size:13px}
  .sms{font-size:13px;line-height:1.5}
  .tabsp .t{font-size:14px}
  .check-row,.recogida-opt{border-radius:var(--r-md);font-size:14px}
  .pista,.ticker .pista{font-size:12px}
  /* El ticker, rediseñado: tarjetas más anchas para que el texto no se apile
     (con 128 px y 13 px de cuerpo el contenido subía a 202 y se cortaba 98). */
  .ticker{height:152px}
  .promo{width:208px;padding:12px 14px;border-radius:var(--r-md);font-size:13px;line-height:1.35;box-shadow:none}
  .promo b{font-size:15px;font-weight:700}
  /* La instrucción «arrastra la tarjeta» desaparece: explicar un gesto DENTRO de una
     tarjeta que se mueve sola es ilegible por diseño. El gesto lo enseña el propio
     movimiento, y en la app iría en el onboarding. */
  .promo .tirar{display:none}
`;

// iconos del pie: máscaras SVG monocromas, definidas como variables
const ICONOS = `:root{
    --ic-casa:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 10.5 12 3l9 7.5'/><path d='M5 9.5V21h14V9.5'/></svg>");
    --ic-ticket:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8h18v3a2 2 0 0 0 0 2v3H3v-3a2 2 0 0 0 0-2z'/><path d='M12 8v8' stroke-dasharray='2 2'/></svg>");
    --ic-ruta:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='m15 9-2.5 6L9 12.5z'/></svg>");
    --ic-panel:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='7' height='7' rx='1.5'/><rect x='14' y='3' width='7' height='7' rx='1.5'/><rect x='3' y='14' width='7' height='7' rx='1.5'/><rect x='14' y='14' width='7' height='7' rx='1.5'/></svg>");
    --ic-perfil:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4 3.6-6 8-6s8 2 8 6'/></svg>");
  }`;

fs.writeFileSync(path.join(DIR, "tema-v2.css"), css + ICONOS + CAPA, "utf8");
console.log(`tema-v2.css escrito · ${cambiosTam} tamaños reescalados · ${cambiosRadio} radios normalizados`);
console.log(`tamaño: ${(fs.statSync(path.join(DIR, "tema-v2.css")).size / 1024).toFixed(1)} KB`);
