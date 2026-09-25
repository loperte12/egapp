/**
 * diagnostics — APK de diagnóstico (2026-09-03).
 * Captura errores JS globales (ErrorUtils) y errores de render de React, y los
 * muestra en pantalla con el mensaje y el stack. Sirve para ver por qué un APK
 * release se cierra solo al arrancar (en release no hay LogBox/RedBox).
 *
 * Uso: envolver la app en <CrashShield> desde el layout raíz.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {brand, espaciado, neutro, peso, tipografia} from '@egrouteplan/ui-kit';

interface State { error: Error | null; }
type Sink = (err: Error) => void;
let sink: Sink | null = null;
export function setCrashSink(fn: Sink) { sink = fn; }

if (typeof globalThis !== 'undefined') {
  const g = globalThis as any;
  if (g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === 'function') {
    const prev = g.ErrorUtils.getGlobalHandler ? g.ErrorUtils.getGlobalHandler() : null;
    g.ErrorUtils.setGlobalHandler((e: any, isFatal?: boolean) => {
      const err = e instanceof Error ? e : new Error(String((e && (e.message || e.stack)) || e));
      try { sink?.(err); } catch { /* noop */ }
      if (typeof prev === 'function') { try { prev(e, isFatal); } catch { /* noop */ } }
    });
  }
}

export class CrashShield extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    setCrashSink((err) => this.setState({ error: err }));
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return <CrashView error={this.state.error} />;
    }
    return this.props.children;
  }
}

function CrashView({ error }: { error: Error }) {
  const message = String(error?.message ?? error ?? 'Error desconocido');
  const stack = String(error?.stack ?? '');
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>⚠️ Error al arrancar la app</Text>
        <Text style={styles.msg}>{message}</Text>
        <View style={styles.box}>
          <Text style={styles.stack}>{stack || '(sin stack)'}</Text>
        </View>
        <Text style={styles.hint}>
          Envía este texto al desarrollador. Para reintentar, cierra y abre la app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.decoBrasa },
  content: { padding: espaciado.e20, paddingTop: 80 },
  title: { color: brand.danger, fontSize: tipografia.title, fontWeight: peso.titulo, marginBottom: espaciado.e12 },
  msg: { color: brand.decoRosaClaro, fontSize: 15, fontWeight: peso.fuerte, marginBottom: espaciado.e12 },
  box: { backgroundColor: brand.decoBrasaClaro, borderRadius: 10, padding: espaciado.e12 },
  stack: { color: brand.decoRosa, fontSize: tipografia.caption, fontFamily: 'monospace' },
  hint: { color: neutro.n600, fontSize: tipografia.caption, marginTop: espaciado.e16, textAlign: 'center' },
});
