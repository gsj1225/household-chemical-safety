"""SafetyScopeClassifier — 超范围安全判定。

在输入标准化之后、任何 LLM 调用与知识库检索之前执行。
命中即判定 outOfScope=true，立即短路返回，不依赖 LLM 返回字段。
"""

from __future__ import annotations

_OUT_OF_SCOPE_KEYWORDS = [
    "误食", "误饮", "中毒", "吸入", "身体不适",
    "急救", "洗胃", "送医", "呕吐", "晕厥", "昏迷", "就医",
]


class SafetyScopeClassifier:
    """判断问题是否涉及意外事故处置（命中则拒答，不调用任何 LLM）。"""

    def is_out_of_scope(self, question: str) -> bool:
        q = question or ""
        return any(k in q for k in _OUT_OF_SCOPE_KEYWORDS)
