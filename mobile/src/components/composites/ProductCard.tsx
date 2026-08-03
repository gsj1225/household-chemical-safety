import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { semanticColors, rawTokens, componentTokens } from '../../theme/tokens';
import AppText from '../primitives/AppText';
import SemanticBadge from '../primitives/SemanticBadge';
import Surface from '../primitives/Surface';
import ProductPhoto from './ProductPhoto';
import type { InventoryProduct } from '../../types/inventory';

interface ProductCardProps {
  product: InventoryProduct;
  /** 本地封面缩略图 URI */
  coverUri: string | null;
  /** 卡片宽度 */
  cardWidth: number;
  /** 是否减少动态（由 ProductGrid 统一传入） */
  reducedMotion?: boolean;
  onPress?: () => void;
}

const categoryLabels: Record<string, string> = {
  kitchen_cleaner: '厨房清洁',
  bathroom_cleaner: '浴室清洁',
  toilet_cleaner: '洁厕',
  descaler: '除垢',
  drain_cleaner: '管道疏通',
  disinfectant: '消毒',
  bleach: '漂白',
  laundry: '洗衣',
  fabric_softener: '柔顺',
  stain_remover: '去渍',
  pesticide: '杀虫',
  insect_repellent: '驱虫',
  other: '其他',
};

export default function ProductCard({
  product,
  coverUri,
  cardWidth,
  reducedMotion = false,
  onPress,
}: ProductCardProps) {
  const photoWidth = cardWidth - 2 * rawTokens.space[3];
  const categoryLabel = categoryLabels[product.category] ?? product.category;
  const needsInfo = product.information_status === 'needs_information';

  // 格式化日期显示
  const expiryText = product.expiry_date?.value
    ? `有效至 ${product.expiry_date.value}`
    : null;
  const storageText = product.storage_requirements?.length
    ? product.storage_requirements.map((s) => s.text).join('、')
    : null;
  const hazardCount = product.hazards?.length ?? 0;

  const pressedStyle = reducedMotion
    ? styles.pressedReduced
    : styles.pressed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}，${product.brand ?? '未知品牌'}，${categoryLabel}`}
      style={({ pressed }) => [
        styles.pressable,
        { width: cardWidth },
        pressed && pressedStyle,
      ]}
    >
      <Surface
        variant="outlined"
        padded={false}
        style={styles.card}
      >
        <View style={styles.photoContainer}>
          <ProductPhoto
            uri={coverUri}
            productName={product.name}
            width={photoWidth}
          />
        </View>
        <View style={styles.info}>
          <AppText variant="label" numberOfLines={2} style={styles.name}>
            {product.name}
          </AppText>
          {product.brand ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {product.brand}
            </AppText>
          ) : null}
          <View style={styles.badges}>
            <SemanticBadge label={categoryLabel} tone="neutral" />
            {needsInfo ? (
              <SemanticBadge label="待补充" tone="unknown" />
            ) : null}
            {hazardCount > 0 ? (
              <SemanticBadge label={`${hazardCount}项危险`} tone="attention" />
            ) : null}
          </View>
          {expiryText ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {expiryText}
            </AppText>
          ) : null}
          {storageText ? (
            <AppText variant="caption" color="muted" numberOfLines={1}>
              储存：{storageText}
            </AppText>
          ) : null}
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    // 宽度由 props.cardWidth 动态设置
  },
  card: {
    padding: rawTokens.space[3],
    gap: rawTokens.space[2],
    borderRadius: componentTokens.surface.radius,
    ...componentTokens.elevation.card,
  },
  pressed: {
    ...componentTokens.interaction.cardPressed,
  },
  pressedReduced: {
    ...componentTokens.interaction.cardPressedReduced,
  },
  photoContainer: {
    alignItems: 'center',
  },
  info: {
    gap: rawTokens.space[1],
  },
  name: {
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[1],
    marginTop: rawTokens.space[1],
  },
});
