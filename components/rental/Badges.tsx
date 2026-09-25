/**
 * Badges de monetización del kit (rental): FeaturedBadge, PremiumBadge,
 * VerificationBadge (niveles 1-3). Construidos sobre el Badge genérico.
 */

import React from 'react';
import { Badge } from './Badge';
import {brand, neutro} from '@egrouteplan/ui-kit';

export function FeaturedBadge({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return (
    <Badge
      label="★ Destacado"
      backgroundColor={brand.warning}
      textColor={brand.warningText}
      size={size}
      accessibilityLabel="Anuncio destacado"
    />
  );
}

export function PremiumBadge({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return (
    <Badge
      label="♛ Premium"
      backgroundColor={brand.warningPressed}
      textColor={brand.white}
      size={size}
      accessibilityLabel="Anuncio premium"
    />
  );
}

export const VERIFICATION_LEVELS = {
  PHONE_ONLY: 1,
  VERIFIED: 2,
  ADVANCED: 3,
} as const;

const getVerificationConfig = (level: number) => {
  switch (level) {
    case VERIFICATION_LEVELS.VERIFIED:
      return {
        label: '✓ Verificado',
        backgroundColor: brand.infoPressed,
        textColor: brand.white,
        accessibilityLabel: 'Anunciante verificado',
      };
    case VERIFICATION_LEVELS.ADVANCED:
      return {
        label: '✓✓ Verificación avanzada',
        backgroundColor: brand.success,
        textColor: brand.white,
        accessibilityLabel: 'Anunciante con verificación avanzada',
      };
    case VERIFICATION_LEVELS.PHONE_ONLY:
    default:
      return {
        label: 'Teléfono',
        backgroundColor: neutro.n300,
        textColor: neutro.n900,
        accessibilityLabel: 'Anunciante con teléfono registrado',
      };
  }
};

export function VerificationBadge({
  level = VERIFICATION_LEVELS.PHONE_ONLY,
  size = 'normal',
  minLevel = VERIFICATION_LEVELS.PHONE_ONLY,
}: {
  level?: number;
  size?: 'normal' | 'small';
  minLevel?: number;
}) {
  if (level < minLevel) return null;
  const config = getVerificationConfig(level);
  return (
    <Badge
      label={config.label}
      backgroundColor={config.backgroundColor}
      textColor={config.textColor}
      size={size}
      accessibilityLabel={config.accessibilityLabel}
    />
  );
}
