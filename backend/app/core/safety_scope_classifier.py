"""SafetyScopeClassifier — 超范围安全判定。

在输入标准化之后、任何 LLM 调用与知识库检索之前执行。
命中即判定 outOfScope=true，立即短路返回，不依赖 LLM 返回字段。

契约（P1-3 方案 B，与 Stage 2 设计 §4.5 一致）：
is_out_of_scope(question, image_bytes) 同时接收文字与图片，
在任何 LLM 调用与知识库检索之前完成事故安全判定。
照片首期只用于污渍/材质/场景识别；本规则类判定器不做真实视觉，
事故判定以伴随的文字/问题为依据，图片随流程一并传入以确保前置。
"""

from __future__ import annotations

_OUT_OF_SCOPE_KEYWORDS = [
    "误食", "误饮", "中毒", "吸入", "身体不适",
    "急救", "洗胃", "送医", "呕吐", "晕厥", "昏迷", "就医",
]

class SafetyScopeClassifier:
    """判断问题是否涉及意外事故处置（命中则拒答，不调用任何 LLM）。"""

    def is_out_of_scope(self, question: str, image_bytes: bytes | None = None) -> bool:
        """前置事故安全判定：在任意 LLM / 知识检索前调用。

        当前为确定性规则判定，仅依据文字关键词；image_bytes 参与契约签名，
        确保图片场景同样在 LLM 前经过超范围判定（照片内容本身不触发，
        事故判定以伴随文字为准）。
        """
        q = question or ""
        return any(k in q for k in _OUT_OF_SCOPE_KEYWORDS)
