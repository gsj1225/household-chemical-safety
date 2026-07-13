/**
 * 排雷挑战全局状态管理
 */

import { create } from 'zustand';
import type {
  PanoramaArea,
  ScanResult,
  ReportData,
  ScanPageStatus,
} from '../types';

interface ChallengeState {
  // 挑战ID
  challengeId: string | null;

  // 页面状态
  pageStatus: ScanPageStatus;

  // 全景扫描结果
  areas: PanoramaArea[];
  currentAreaIndex: number;

  // 识别结果
  scanResults: ScanResult[];
  mineCount: number;

  // 最终报告
  report: ReportData | null;

  // 当前引导消息
  guideMessage: string;

  // Actions
  setChallengeId: (id: string) => void;
  setPanoramaAreas: (areas: PanoramaArea[], guideMessage: string) => void;
  addScanResult: (result: ScanResult) => void;
  nextArea: () => void;
  setPageStatus: (status: ScanPageStatus) => void;
  setGuideMessage: (msg: string) => void;
  setReport: (report: ReportData) => void;
  reset: () => void;
}

const initialState = {
  challengeId: null,
  pageStatus: 'panorama' as ScanPageStatus,
  areas: [] as PanoramaArea[],
  currentAreaIndex: 0,
  scanResults: [] as ScanResult[],
  mineCount: 0,
  report: null,
  guideMessage: '',
};

export const useChallengeStore = create<ChallengeState>((set, get) => ({
  ...initialState,

  setChallengeId: (id) => set({ challengeId: id }),

  setPanoramaAreas: (areas, guideMessage) =>
    set({
      areas,
      guideMessage,
      pageStatus: 'guide',
      currentAreaIndex: 0,
    }),

  addScanResult: (result) => {
    const state = get();
    const newResults = [...state.scanResults, result];
    const newMineCount = result.status === 'mine' ? state.mineCount + 1 : state.mineCount;
    set({
      scanResults: newResults,
      mineCount: newMineCount,
      pageStatus: 'single_result',
      guideMessage: result.guide_message,
    });
  },

  nextArea: () => {
    const state = get();
    const nextIndex = state.currentAreaIndex + 1;
    if (nextIndex < state.areas.length) {
      set({
        currentAreaIndex: nextIndex,
        pageStatus: 'guide',
        guideMessage: state.areas[nextIndex].guide_message,
      });
    } else {
      set({ pageStatus: 'done' });
    }
  },

  setPageStatus: (status) => set({ pageStatus: status }),
  setGuideMessage: (msg) => set({ guideMessage: msg }),
  setReport: (report) => set({ report }),

  reset: () => set({ ...initialState }),
}));
