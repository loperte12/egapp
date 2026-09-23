/**
 * Fase 0 · 0.7 — canal de soporte REAL (D-37).
 *
 * Antes: los cuatro enlaces de Ajustes respondían «Próximamente» y tres pantallas de dinero
 * remitían a un soporte que no existía. Ahora hay correo, WhatsApp y teléfono de verdad, con los
 * datos en un solo sitio (`constants/soporte.ts`).
 *
 * Uso: node pruebas/fase0-soporte-real.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

function rep(rel, from, to, label) {
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) { console.log(`  FALTA ${rel}`); fallos++; return; }
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  fs.writeFileSync(p, t.split(from).join(to), 'utf8');
  console.log(`  OK ${label}`);
}

// ─────────────────────────── settings.tsx ───────────────────────────
const S = 'app/settings.tsx';
rep(S,
  `  ArrowLeft, Ban, Bell, Check, ChevronRight, Clock, Eye, FileWarning, Flag, Globe, Headset,
  HelpCircle, Languages, LogOut, MapPin, Moon, Siren, Type, X,`,
  `  ArrowLeft, Ban, Bell, Check, ChevronRight, Clock, Eye, FileWarning, Flag, Globe, Headset,
  HelpCircle, Languages, LogOut, Mail, MapPin, Moon, Phone, Siren, Type, X,`,
  'settings: iconos de correo y teléfono');
rep(S,
  "import { useRouter } from 'expo-router';",
  `import { useRouter } from 'expo-router';
import { SOPORTE, escribirASoporte, whatsappSoporte, llamarASoporte } from '../constants/soporte';`,
  'settings: import del soporte real');
rep(S,
  `          <Row icon={HelpCircle} label="Ayuda y soporte" onPress={() => Alert.alert('Próximamente', 'La guía de ayuda llegará en una próxima actualización.')} />
          <Row icon={Globe} label="Preguntas frecuentes" onPress={() => Alert.alert('Próximamente', 'Las preguntas frecuentes llegarán en una próxima actualización.')} />
          <Row icon={Headset} label="Contactar soporte" onPress={() => Alert.alert('Próximamente', 'El chat con soporte llegará en una próxima actualización.')} />
          <Row icon={Flag} label="Reportar un problema" onPress={() => Alert.alert('Reportar', 'Describe el problema en Ayuda y soporte (próximamente).')} last />`,
  `          {/*
            SOPORTE REAL (auditoría de diseño, D-37). Aquí había cuatro filas que respondían
            «Próximamente» mientras tres pantallas de dinero decían «contacta soporte». Se
            sustituyen por los tres canales que existen de verdad y el reporte de problemas.
          */}
          <Row icon={Headset} label="Ayuda por WhatsApp" subtitle={SOPORTE.telefono} onPress={() => { void whatsappSoporte('Hola, necesito ayuda con EG Route Plan.'); }} />
          <Row icon={Mail} label="Escribir un correo" subtitle={SOPORTE.email} onPress={() => { void escribirASoporte('Ayuda con EG Route Plan'); }} />
          <Row icon={Phone} label="Llamar al soporte" subtitle={SOPORTE.telefono} onPress={() => { void llamarASoporte(); }} />
          <Row icon={Flag} label="Reportar un problema" onPress={() => { void escribirASoporte('Problema en la app', 'Cuéntanos qué pasó (qué hacías, qué esperabas y qué salió):\\n\\n'); }} last />`,
  'settings: los cuatro enlaces son canales reales');

// ─────────────────────────── kyc/status.tsx ───────────────────────────
const K = 'app/kyc/status.tsx';
rep(K,
  "import { useRouter } from 'expo-router';",
  `import { useRouter } from 'expo-router';
import { SOPORTE, whatsappSoporte } from '../../constants/soporte';`,
  'kyc/status: import del soporte real');
rep(K,
  `            message="Ponte en contacto con soporte si crees que es un error."
            actionLabel="Volver al inicio"
            onAction={() => router.replace('/')}`,
  `            message={\`Si crees que es un error, escríbenos: \${SOPORTE.email} · WhatsApp \${SOPORTE.telefono}\`}
            actionLabel="Escribir al soporte"
            onAction={() => { void whatsappSoporte('Hola, creo que hay un error en mi verificación de identidad.'); }}`,
  'kyc/status: el rechazo lleva al soporte de verdad');

// ─────────────────────────── billing-status.tsx ───────────────────────────
const B = 'app/billing-status.tsx';
rep(B,
  "import { useRouter } from 'expo-router';",
  `import { useRouter } from 'expo-router';
import { SOPORTE, whatsappSoporte } from '../constants/soporte';`,
  'billing-status: import del soporte real');
rep(B,
  "      Alert.alert('Contacta soporte', 'Este derecho no tiene plan de renovación en la app. Escríbenos por soporte.');",
  `      Alert.alert('Contacta soporte', \`Este derecho no tiene plan de renovación en la app. Escríbenos: \${SOPORTE.email} · WhatsApp \${SOPORTE.telefono}\`, [
        { text: 'Cerrar', style: 'cancel' },
        { text: 'WhatsApp', onPress: () => { void whatsappSoporte('Hola, necesito renovar un derecho de mi plan.'); } },
      ]);`,
  'billing-status: renovación con canal real');
rep(B,
  "'Se cancelará esta orden pendiente de pago. Si ya hiciste una transferencia, contacta soporte para el reembolso.'",
  "`Se cancelará esta orden pendiente de pago. Si ya hiciste una transferencia, escríbenos para el reembolso: ${SOPORTE.email} · WhatsApp ${SOPORTE.telefono}`",
  'billing-status: aviso de cancelación con contacto');
rep(B,
  "            Alert.alert('Orden cancelada', 'Tu orden fue cancelada. Si ya pagaste, contacta soporte para el reembolso.');",
  `            Alert.alert('Orden cancelada', \`Tu orden fue cancelada. Si ya pagaste, escríbenos para el reembolso: \${SOPORTE.email} · WhatsApp \${SOPORTE.telefono}\`, [
              { text: 'Cerrar', style: 'cancel' },
              { text: 'Pedir el reembolso', onPress: () => { void whatsappSoporte('Hola, cancelé una orden y ya había pagado. Quiero el reembolso.'); } },
            ]);`,
  'billing-status: reembolso con botón real');

console.log(fallos ? `\n${fallos} anclaje(s) fallidos` : '\n0.7 aplicado');
process.exit(fallos ? 1 : 0);
