/**
 * 全局 TypeScript 类型定义 — v2.0
 *
 * V1 排雷挑战类型已退出，仅保留 V2 导航类型。
 */

// ============ 导航 ============

export type RootStackParamList = {
  Inventory: undefined;
  IntakeFlow: { rescanProductId?: string } | undefined;
  ProductDetail: { productId: string };
  ProductEdit: { productId: string };
  Compatibility: undefined;
  RelationDetail: { relationId: string };
  Assistant: { contextProductId?: string } | undefined;
};
