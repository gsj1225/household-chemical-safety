import type { ReportData } from '../types';
import { selectChemicalProfile } from './chemicalProfile.ts';

export interface ShareCardData {
  sceneLabel: string;
  score: number;
  totalMines: number;
  safeItems: number;
  totalChecked: number;
  conclusion: string;
  profileLabel: string;
  profileNote: string;
  riskSummary: string;
  invitation: string;
  privacyNote: string;
  disclaimer: string;
}

const clampInteger = (value: number, min: number, max: number) => (
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : 0)))
);

const compactText = (value: string | undefined, fallback: string, maxLength: number) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() || fallback;
  return normalized.slice(0, maxLength);
};

/**
 * 分享卡唯一的数据入口。它刻意从完整报告中复制少量允许公开的统计字段，
 * 不返回产品名称、证据链接、照片 URI、地址或 challenge_id。
 */
export function buildShareCardData(report: ReportData): ShareCardData {
  const score = clampInteger(report.score, 0, 100);
  const totalMines = clampInteger(report.total_mines, 0, 99);
  const safeItems = clampInteger(report.safe_items, 0, 99);
  const profile = selectChemicalProfile(score, totalMines);

  return {
    sceneLabel: compactText(report.scene_label, '当前场景', 18),
    score,
    totalMines,
    safeItems,
    totalChecked: totalMines + safeItems,
    conclusion: totalMines === 0
      ? '本轮未命中已配置规则'
      : `还有 ${totalMines} 处需要注意`,
    profileLabel: compactText(profile.label, '家庭化学品观察员', 18),
    profileNote: compactText(profile.note, '认真看标签，也认真对待每一次混用。', 42),
    riskSummary: totalMines === 0
      ? '这次没命中规则，不等于获得永久安全证明。'
      : `本场景有 ${totalMines} 条建议值得优先处理。`,
    invitation: '测测你家离家庭实验室还有几步',
    privacyNote: '不含原始照片、产品名称和家庭地址',
    disclaimer: '结果基于本次照片与现有规则，仅作预防性提示。',
  };
}
