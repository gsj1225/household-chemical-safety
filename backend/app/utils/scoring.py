"""评分计算工具"""

from app.models.risk import RiskLevel


def calculate_score(
    critical_count: int,
    medium_count: int,
    low_count: int,
) -> int:
    """计算排雷评分。

    基础分100，高危雷-30，中危雷-15，低危雷-5，最低0分。
    """
    deduction = critical_count * 30 + medium_count * 15 + low_count * 5
    return max(0, 100 - deduction)


def get_score_level(score: int) -> str:
    """根据评分返回评级文案。"""
    if score >= 90:
        return "你家比实验室还安全"
    elif score >= 70:
        return "基本安全，但有几个角落要收拾了"
    elif score >= 50:
        return "隐患不少，建议按排雷报告逐项处理"
    else:
        return "你家是化学品雷区，请立即排雷！"


def get_score_color_hint(score: int) -> str:
    """根据评分返回颜色提示（供前端参考）。"""
    if score >= 70:
        return "safe"
    elif score >= 50:
        return "medium"
    else:
        return "critical"


def generate_share_text(score: int, total_mines: int) -> str:
    """生成分享文案。"""
    return (
        f"我家排雷{score}分，发现{total_mines}个雷！"
        f"你家能拿多少分？来挑战→"
    )
