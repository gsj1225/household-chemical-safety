import React from 'react';
import { StyleSheet } from 'react-native';
import { rawTokens } from '../../theme/tokens';
import { AppText, Surface } from '../primitives';

interface ChemicalProfileCardProps {
  label: string;
  note: string;
}

export default function ChemicalProfileCard({
  label,
  note,
}: ChemicalProfileCardProps) {
  return (
    <Surface
      variant="inverse"
      style={styles.container}
      accessibilityLabel={`本场景化学人格：${label}。${note}`}
    >
      <AppText variant="caption" color="inverse" style={styles.eyebrow}>
        YOUR CHEMICAL TYPE
      </AppText>
      <AppText variant="titleSmall" color="inverse">{label}</AppText>
      <AppText variant="caption" color="inverse" style={styles.note}>
        {note}
      </AppText>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[2],
    paddingVertical: rawTokens.space[4],
    paddingHorizontal: rawTokens.space[5],
  },
  eyebrow: {
    opacity: 0.72,
    letterSpacing: 1,
  },
  note: {
    opacity: 0.86,
  },
});
