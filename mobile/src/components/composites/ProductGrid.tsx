import React, { useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { calculateCardWidth, MAX_CONTENT_WIDTH, getGap } from '../../view-models/gridLayout';
import useReducedMotion from '../../hooks/useReducedMotion';
import ProductCard from './ProductCard';
import type { InventoryProduct } from '../../types/inventory';

export interface ProductGridItem {
  product: InventoryProduct;
  coverUri: string | null;
}

interface ProductGridProps {
  items: ProductGridItem[];
  onPressProduct?: (productId: string) => void;
}

export default function ProductGrid({ items, onPressProduct }: ProductGridProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const reducedMotion = useReducedMotion();

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const w = e.nativeEvent.layout.width;
      if (w > 0 && Math.abs(w - gridWidth) > 1) {
        setGridWidth(w);
      }
    },
    [gridWidth],
  );

  // 基于 Grid 实际可用宽度计算卡片宽度
  const cardWidth = calculateCardWidth(gridWidth);
  const gap = getGap(gridWidth);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {cardWidth > 0 ? (
        <View style={[styles.grid, { gap }]}>
          {items.map((item) => (
            <ProductCard
              key={item.product.productId}
              product={item.product}
              coverUri={item.coverUri}
              cardWidth={cardWidth}
              reducedMotion={reducedMotion}
              onPress={
                onPressProduct
                  ? () => onPressProduct(item.product.productId)
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
});
