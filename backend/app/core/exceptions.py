"""与 HTTP 无关的业务异常。"""


class ChallengeNotFoundError(Exception):
    pass


class ChallengeCompletedError(Exception):
    pass


class ScanLimitExceededError(Exception):
    pass


class AIProviderError(Exception):
    """上游模型响应不可用、被拒绝或不符合约定。"""


class AIProviderTimeoutError(AIProviderError):
    """上游模型调用超时。"""


class IdentificationDraftNotFoundError(Exception):
    """识别草稿不存在、已确认或已被新草稿替换。"""


class ReportEvidenceRequiredError(Exception):
    """当前场景没有用户确认的近景结果，不能生成评分。"""


class PanoramaReplacementNotAllowedError(Exception):
    """已有确认结果后不允许替换当前 challenge 的全景图。"""
