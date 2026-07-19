"""确定性报告构建器，不依赖生成式模型。"""

from app.models.report import MineSummary, ReportData
from app.utils.scoring import calculate_score, generate_share_text, get_score_level


def build_report(
    scan_results: list[dict],
    total_mines: int,
    scene_label: str = "当前场景",
) -> ReportData:
    mine_list: list[MineSummary] = []
    breakdown = {"critical": 0, "medium": 0, "low": 0}
    safe_count = 0

    for record in scan_results:
        if record.get("status") == "mine" and record.get("risk"):
            risk = record["risk"]
            level = risk.get("level", "low")
            if level in breakdown:
                breakdown[level] += 1
            mine_list.append(MineSummary(
                products=[record.get("product_name", "未知产品")],
                type=risk.get("type", "通用风险"),
                level=level,
                description=risk.get("description", ""),
                advice=risk.get("advice", ""),
                evidence_status=risk.get("evidence_status", "needs_review"),
                evidence_level=risk.get("evidence_level", "unverified"),
                reviewed_at=risk.get("reviewed_at"),
                sources=risk.get("sources", []),
                confirmed_by_user=record.get("confirmed_by_user", False),
            ))
        elif record.get("status") == "safe":
            safe_count += 1

    score = calculate_score(
        breakdown["critical"], breakdown["medium"], breakdown["low"]
    )
    return ReportData(
        scene_label=scene_label,
        score=score,
        level=get_score_level(score),
        total_mines=total_mines,
        mine_breakdown=breakdown,
        mines=mine_list,
        safe_items=safe_count,
        share_text=generate_share_text(score, total_mines),
    )
