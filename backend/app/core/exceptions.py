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
