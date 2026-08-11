/**
 * Assistant Store — Stage 4
 *
 * 管理问答会话：
 * - 会话消息本地保留（离开页面可恢复，不持久化到后端）
 * - 发送时先本地加入用户消息，再调用 API；失败保留消息并允许重试
 * - history 只发送最近 12 条
 * - 照片仅临时压缩上传，不保存到封面/库存资产目录
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE, authHeaders } from '../services/apiClient.ts';
import {
  uploadAssistantQuestion,
  type AssistantNativeUploadFn,
  type AssistantUploadDeps,
} from '../services/assistantApi.ts';
import { photoAssetService } from '../services/photoAssetService.ts';
import {
  applySendFailure,
  applySendStart,
  applySendSuccess,
  attachPhoto,
  buildSendRequest,
  clearAttachment,
  retryRequest,
  setContext,
  setDraft,
  type AssistantUiState,
} from '../view-models/assistant.ts';
import type { AssistantMessage } from '../types/assistant.ts';

/** 原生上传通道：封装 expo-file-system uploadAsync（MULTIPART + parameters） */
const nativeAssistantUpload: AssistantNativeUploadFn = (url, fileUri, options) =>
  FileSystem.uploadAsync(url, fileUri, {
    httpMethod: options.httpMethod,
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: options.fieldName,
    mimeType: options.mimeType,
    parameters: options.parameters,
    headers: options.headers,
  });

/** 运行时依赖：由生产环境组装，Node 测试不经过此文件 */
export function buildRuntimeAssistantDeps(): AssistantUploadDeps {
  return {
    platform: Platform.OS,
    apiBase: API_BASE,
    headers: authHeaders(),
    uploadFn: nativeAssistantUpload,
  };
}

interface AssistantStore extends AssistantUiState {
  setDraft: (draft: string) => void;
  setContextProductId: (productId?: string) => void;
  attachPhoto: (uri: string) => void;
  clearAttachment: () => void;
  reset: () => void;
  send: () => Promise<void>;
  retry: () => Promise<void>;
}

export const useAssistantStore = create<AssistantStore>((set, get) => ({
  messages: [],
  draft: '',
  pendingImageUri: null,
  contextProductId: undefined,
  sending: false,
  error: null,

  setDraft: (draft) => set((s) => setDraft(s, draft)),

  setContextProductId: (productId) => set((s) => setContext(s, productId)),

  attachPhoto: (uri) => set((s) => attachPhoto(s, uri)),

  clearAttachment: () => set((s) => clearAttachment(s)),

  reset: () =>
    set({
      messages: [],
      draft: '',
      pendingImageUri: null,
      contextProductId: undefined,
      sending: false,
      error: null,
    }),

  send: async () => {
    const state = get();
    const request = buildSendRequest(state);
    if (!request) return;
    set(applySendStart(state));
    try {
      const imageUri = request.imageUri
        ? (await photoAssetService.compressForUpload(request.imageUri)).uri
        : undefined;
      const response = await uploadAssistantQuestion(
        {
          question: request.question,
          history: request.history,
          contextProductId: state.contextProductId,
          imageUri,
        },
        buildRuntimeAssistantDeps(),
      );
      set((s) => applySendSuccess(s, response));
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败';
      set((s) => applySendFailure(s, message));
    }
  },

  retry: async () => {
    const state = get();
    const request = retryRequest(state);
    if (!request) return;
    set({ sending: true, error: null });
    try {
      const imageUri = request.imageUri
        ? (await photoAssetService.compressForUpload(request.imageUri)).uri
        : undefined;
      const response = await uploadAssistantQuestion(
        {
          question: request.question,
          history: request.history,
          contextProductId: state.contextProductId,
          imageUri,
        },
        buildRuntimeAssistantDeps(),
      );
      set((s) => applySendSuccess(s, response));
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败';
      set((s) => applySendFailure(s, message));
    }
  },
}));

export type { AssistantMessage };
