/**
 * 全局 TypeScript 类型定义
 */

// ============ 通用 ============

export type RiskLevel = 'safe' | 'low' | 'medium' | 'critical';

export type ScanStatus = 'safe' | 'mine';

// ============ 挑战 ============

export interface ChallengeInfo {
  challenge_id: string;
  guide_message: string;
  created_at: string;
}

export interface ChallengeHistoryItem {
  challenge_id: string;
  created_at: string;
  total_mines: number;
  is_completed: boolean;
  score: number | null;
}

// ============ 扫描 ============

export interface IdentificationConfidence {
  confidence: 'high' | 'medium' | 'low';
}

export interface ProductIdentification {
  brand: string;
  name: string;
  category: string;
  ingredients: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface IdentificationDraft {
  draft_id: string;
  challenge_id: string;
  area_id: string;
  product: ProductIdentification;
  requires_review: boolean;
  guide_message: string;
  created_at: string;
}

export interface PanoramaArea {
  area_id: string;
  description: string;
  items_hint: string;
  risk_level: string;
  guide_message: string;
  bbox_2d?: [number, number, number, number] | null;
}

export interface PanoramaResult {
  scan_id: string;
  areas: PanoramaArea[];
  guide_message: string;
}

export interface RiskResult {
  level: RiskLevel;
  type: string;
  title: string;
  description: string;
  advice: string;
  evidence_status: 'verified' | 'needs_review';
  evidence_level: 'authoritative' | 'secondary' | 'unverified';
  reviewed_at: string | null;
  sources: EvidenceSource[];
}

export interface EvidenceSource {
  organization: string;
  title: string;
  url: string;
}

export interface ScanResult {
  scan_id: string;
  challenge_id: string;
  area_id: string;
  status: ScanStatus;
  product: ProductIdentification;
  risk: RiskResult | null;
  guide_message: string;
  confirmed_by_user: boolean;
  created_at: string;
}

// ============ 报告 ============

export interface MineSummary {
  products: string[];
  type: string;
  level: string;
  description: string;
  advice: string;
  evidence_status: 'verified' | 'needs_review';
  evidence_level: 'authoritative' | 'secondary' | 'unverified';
  reviewed_at: string | null;
  sources: EvidenceSource[];
  confirmed_by_user: boolean;
}

export interface ReportData {
  score: number;
  level: string;
  total_mines: number;
  mine_breakdown: {
    critical: number;
    medium: number;
    low: number;
  };
  mines: MineSummary[];
  safe_items: number;
  share_text: string;
}

export interface NarrationResponse {
  narrations: string[];
}

// ============ 页面状态 ============

export type ScanPageStatus =
  | 'panorama'    // 拍全景
  | 'panorama_empty' // 全景未定位到可细拍区域
  | 'guide'       // 引导细拍
  | 'analyzing'   // 识别中
  | 'identification_review' // 用户核对产品识别草稿
  | 'finishing'   // 生成报告
  | 'single_result' // 单次结果
  | 'done';       // 完成

// ============ 导航 ============

export type RootStackParamList = {
  Home: undefined;
  History: undefined;
  Scan: undefined;
  Result: undefined;
};
