"""SafetyScopeClassifier — 超范围安全判定。

在输入标准化之后、任何 LLM 调用与知识库检索之前执行。
命中即判定 outOfScope=true，立即短路返回，不依赖 LLM 返回字段。

契约（P1-3 方案 A）：
SafetyScopeClassifier.is_out_of_scope() 只接收文字 question，不做图片视觉判定。
图片首期只用于污渍/材质/场景识别，不用于误食、中毒、吸入、身体不适等
事故视觉判定。文字命中事故关键词才触发前置短路。
"""

from __future__ import annotations

_OUT_OF_SCOPE_KEYWORDS = [
    "误食", "误饮", "中毒", "吸入", "身体不适",
    "急救", "洗胃", "送医", "呕吐", "晕厥", "昏迷", "就医",
]

class SafetyScopeClassifier:
    """判断问题是否涉及意外事故处置（命中则拒答，不调用任何 LLM）。"""

    def is_out_of_scope(self, question: str) -> bool:
        """前置文字安全范围判定：在任意 LLM / 知识检索前调用。

        仅依据文字关键词判定事故；不接收、不分析图片。
        图片首期只用于污渍/材质/场景识别，不参与事故判定。
        """
        q = question or ""
        return any(k in q for k in _OUT_OF_SCOPE_KEYWORDS)
