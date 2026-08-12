/**
 * AssistantMessage — 单条会话消息
 * - user：文字 + 可选照片缩略图（文字保持 inverse 色）
 * - assistant：按知识状态分层渲染（Stage 3/4）
 *
 * 渲染优先级：
 *  1. outOfScope（拒答，隐藏所有产品/知识/外部操作建议）
 *  2. critical safetyWarnings 优先展示
 *  3. knowledgeStatus 决定知识/库存/外部卡片
 *  4. inventoryAdvice
 *  5. 外部来源（external_hit）
 *  6. 普通回答文字 + 追问 + 来源分层
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import { canRenderInventoryAdvice, normalizeAssistantResponse, type NormalizedAssistantResponse } from '../../../view-models/assistant';
import InventoryAdviceCard from './InventoryAdviceCard';
import GeneralAdviceCard from './GeneralAdviceCard';
import SafetyWarningCard from './SafetyWarningCard';
import ClarificationPrompt from './ClarificationPrompt';
import KnowledgeAdviceCard from './KnowledgeAdviceCard';
import ExternalSourceCard from './ExternalSourceCard';
import SourceLayersCard from './SourceLayersCard';
import type {
  AssistantMessage as AssistantMessageType,
} from '../../../types/assistant';

interface AssistantMessageProps {
  message: AssistantMessageType;
  onPressProduct: (productId: string) => void;
  onPressRelation: (relationId: string) => void;
  onAskClarification: (question: string) => void;
}

/** 按 knowledgeStatus 渲染知识/库存部分（priority 3） */
function renderByStatus(r: NormalizedAssistantResponse) {
  switch (r.knowledgeStatus) {
    case 'local_hit':
      return r.knowledge.map((k) => (
        <KnowledgeAdviceCard key={k.entryId} knowledge={k} />
      ));
    case 'local_hit_no_inventory':
      return (
        <>
          {r.knowledge.map((k) => (
            <KnowledgeAdviceCard key={k.entryId} knowledge={k} />
          ))}
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="caption" color="secondary">
              库存中暂无通过安全校验的合适产品。
            </AppText>
          </Surface>
        </>
      );
    case 'insufficient':
      // 若有待审核提示，只显示固定文案；不当作知识卡渲染
      if (r.pendingKnowledgeNotice) {
        return (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="caption" color="secondary">
              {r.pendingKnowledgeNotice}
            </AppText>
          </Surface>
        );
      }
      // 其余由后端固定模板 answer 覆盖「暂无足够依据」
      return null;
    case 'no_match':
    case 'external_fail':
      // 后端固定模板 answer 覆盖；external_fail 不得自行补全建议
      return null;
    case 'external_hit':
      // 外部卡片在下方 externalSources 渲染
      return null;
    default:
      return null;
  }
}

export default function AssistantMessage({
  message,
  onPressProduct,
  onPressRelation,
  onAskClarification,
}: AssistantMessageProps) {
  if (message.role === 'user') {
    return (
      <View style={[styles.row, styles.userRow]}>
        <View style={[styles.bubble, styles.userBubble]}>
          {message.text ? (
            <AppText variant="body" color="inverse">{message.text}</AppText>
          ) : null}
          {message.imageUri ? (
            <Image source={{ uri: message.imageUri }} style={styles.userImage} />
          ) : null}
        </View>
      </View>
    );
  }

  const raw = message.response;
  if (!raw) {
    return null;
  }
  // 安全降级：旧后端缺失 Stage 3 字段时使用默认值
  const r = normalizeAssistantResponse(raw);

  // 优先级 1：outOfScope — 隐藏知识卡/库存卡/外部操作建议/通用清洁步骤
  if (r.outOfScope) {
    return (
      <View style={[styles.row, styles.assistantRow]}>
        <View style={styles.assistantBlock}>
          {r.answer ? <AppText variant="body">{r.answer}</AppText> : null}
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label" color="warning">超出回答范围</AppText>
            <AppText variant="caption" color="secondary">
              误食、中毒、吸入或身体不适等紧急情况，请立即联系医生或当地急救，不要依赖本应用的化学建议。
            </AppText>
          </Surface>
          {r.safetyWarnings.map((warning, i) => (
            <SafetyWarningCard
              key={i}
              warning={warning}
              onPressRelation={onPressRelation}
            />
          ))}
          {r.evidence.length > 0 ? (
            <AppText variant="caption" color="muted" style={styles.evidence}>
              依据：{r.evidence.join('；')}
            </AppText>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.assistantRow]}>
      <View style={styles.assistantBlock}>
        {/* 优先级 6：普通回答文字 */}
        {message.text ? <AppText variant="body">{message.text}</AppText> : null}

        {/* 优先级 2：安全提醒（critical 视觉更突出） */}
        {r.safetyWarnings.map((warning, i) => (
          <SafetyWarningCard
            key={i}
            warning={warning}
            onPressRelation={onPressRelation}
          />
        ))}

        {/* 优先级 3：知识库建议 / 库存状态 */}
        {renderByStatus(r)}

        {/* 优先级 4：我的仓库产品建议（仅 local_hit 渲染库存候选；
            其他状态均不得泄漏产品操作卡片，判定逻辑见 canRenderInventoryAdvice） */}
        {canRenderInventoryAdvice(r.knowledgeStatus)
          ? r.inventoryAdvice.map((advice, i) => (
              <InventoryAdviceCard key={i} advice={advice} onPress={onPressProduct} />
            ))
          : null}

        {/* 优先级 5：外部来源（仅 external_hit） */}
        {r.knowledgeStatus === 'external_hit' && r.externalSources.length > 0
          ? r.externalSources.map((src, i) => (
              <ExternalSourceCard key={i} source={src} />
            ))
          : null}

        {/* 兼容旧接口：通用建议 */}
        {r.generalAdvice.length > 0 ? (
          <GeneralAdviceCard advice={r.generalAdvice} />
        ) : null}

        {/* 来源分层（按固定顺序去重展示） */}
        {r.sources.length > 0 ? <SourceLayersCard sources={r.sources} /> : null}

        {/* 追问 */}
        {r.needsClarification && r.clarificationQuestions.length > 0 ? (
          <ClarificationPrompt
            questions={r.clarificationQuestions}
            onAsk={onAskClarification}
          />
        ) : null}

        {r.evidence.length > 0 ? (
          <AppText variant="caption" color="muted" style={styles.evidence}>
            依据：{r.evidence.join('；')}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '100%',
    padding: rawTokens.space[3],
    borderRadius: rawTokens.radius.large,
  },
  userBubble: {
    backgroundColor: semanticColors.surface.inverse,
    gap: rawTokens.space[2],
  },
  userImage: {
    width: 160,
    height: 120,
    borderRadius: rawTokens.radius.medium,
    backgroundColor: semanticColors.surface.muted,
  },
  assistantBlock: {
    width: '100%',
    gap: rawTokens.space[2],
  },
  section: {
    gap: rawTokens.space[1],
  },
  evidence: {
    marginTop: rawTokens.space[1],
  },
});
