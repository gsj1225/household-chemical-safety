"""API 集成测试：进程内运行，不依赖外部服务器或临时文件。"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_ai_provider, get_challenge_repository
from app.core.mock_ai import MockAI
from app.data.repository import ChallengeRepository
from app.main import app
from app.core.rate_limit import rate_limiter
from app.config import settings


IMAGE = {"image": ("test.jpg", b"fake-jpeg-content", "image/jpeg")}


@app.get("/_test/boom", include_in_schema=False)
async def raise_unexpected_error():
    raise RuntimeError("sensitive internal detail")


def assert_error(response, status: int, code: str):
    assert response.status_code == status
    body = response.json()["error"]
    assert body["code"] == code
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert len(body["request_id"]) == 16


def identify_and_confirm(client, challenge_id: str, area_id: str):
    identified = client.post(
        "/api/scan/identify",
        files=IMAGE,
        data={"challenge_id": challenge_id, "area_id": area_id},
    )
    assert identified.status_code == 200
    draft = identified.json()
    confirmed = client.post("/api/scan/confirm", json={
        "challenge_id": challenge_id,
        "draft_id": draft["draft_id"],
        "product": draft["product"],
    })
    return draft, confirmed


@pytest.fixture()
def client(tmp_path):
    rate_limiter.clear()
    repository = ChallengeRepository(str(tmp_path / "test.db"))
    app.state.test_repository = repository
    app.dependency_overrides[get_challenge_repository] = lambda: repository
    app.dependency_overrides[get_ai_provider] = lambda: MockAI()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_complete_challenge_flow(client):
    start = client.post("/api/challenge/start")
    assert start.status_code == 200
    challenge_id = start.json()["challenge_id"]

    panorama = client.post(
        "/api/scan/panorama",
        files=IMAGE,
        data={"challenge_id": challenge_id},
    )
    assert panorama.status_code == 200
    assert len(panorama.json()["areas"]) == 3

    results = []
    for index in range(3):
        _, response = identify_and_confirm(client, challenge_id, f"area-{index}")
        assert response.status_code == 200
        assert response.json()["confirmed_by_user"] is True
        results.append(response.json())

    assert [item["status"] for item in results] == ["safe", "mine", "mine"]
    assert results[2]["risk"]["type"] == "化学品冲突"

    report = client.post(
        "/api/challenge/result", params={"challenge_id": challenge_id}
    )
    assert report.status_code == 200
    assert report.json()["total_mines"] == 2

    rejected = client.post(
        "/api/scan/identify",
        files=IMAGE,
        data={"challenge_id": challenge_id, "area_id": "late"},
    )
    assert_error(rejected, 409, "CHALLENGE_COMPLETED")


def test_rejects_invalid_upload_and_unknown_narration_challenge(client):
    challenge_id = client.post("/api/challenge/start").json()["challenge_id"]
    invalid = client.post(
        "/api/scan/panorama",
        files={"image": ("test.txt", b"hello", "text/plain")},
        data={"challenge_id": challenge_id},
    )
    assert_error(invalid, 415, "UNSUPPORTED_IMAGE_TYPE")

    narration = client.post(
        "/api/narration/generate", params={"challenge_id": "missing"}
    )
    assert_error(narration, 404, "CHALLENGE_NOT_FOUND")


def test_validation_and_unknown_errors_are_safe_and_traceable(client):
    validation = client.post("/api/scan/panorama")
    assert_error(validation, 422, "VALIDATION_ERROR")

    unexpected = client.get("/_test/boom")
    assert_error(unexpected, 500, "INTERNAL_ERROR")
    assert "sensitive" not in unexpected.text

    missing_route = client.get("/does-not-exist")
    assert_error(missing_route, 404, "NOT_FOUND")


def test_rejects_oversized_image(client):
    challenge_id = client.post("/api/challenge/start").json()["challenge_id"]
    oversized = client.post(
        "/api/scan/panorama",
        files={"image": ("large.jpg", b"x" * (5 * 1024 * 1024 + 1), "image/jpeg")},
        data={"challenge_id": challenge_id},
    )
    assert_error(oversized, 413, "IMAGE_TOO_LARGE")


def test_rate_limit_and_security_headers(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_START_PER_MINUTE", 2)
    first = client.post("/api/challenge/start")
    second = client.post("/api/challenge/start")
    limited = client.post("/api/challenge/start")
    assert first.status_code == second.status_code == 200
    assert_error(limited, 429, "RATE_LIMITED")
    assert int(limited.headers["Retry-After"]) >= 1
    assert first.headers["X-Content-Type-Options"] == "nosniff"
    assert first.headers["Cache-Control"] == "no-store"
    assert first.headers["Referrer-Policy"] == "no-referrer"


def test_challenge_scan_quota_and_image_privacy(client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_SCANS_PER_CHALLENGE", 1)
    challenge_id = client.post("/api/challenge/start").json()["challenge_id"]
    draft, first = identify_and_confirm(client, challenge_id, "one")
    assert first.status_code == 200
    limited = client.post(
        "/api/scan/identify", files=IMAGE,
        data={"challenge_id": challenge_id, "area_id": "two"},
    )
    assert_error(limited, 429, "SCAN_LIMIT_REACHED")

    repository = app.state.test_repository
    state = repository.get(challenge_id)
    assert state is not None
    assert "image" not in state.model_dump_json().lower()
    assert b"fake-jpeg-content" not in repository._path.read_bytes()

    repeated = client.post("/api/scan/confirm", json={
        "challenge_id": challenge_id,
        "draft_id": draft["draft_id"],
        "product": draft["product"],
    })
    assert_error(repeated, 429, "SCAN_LIMIT_REACHED")


def test_identification_draft_is_not_counted_until_confirmation(client):
    challenge_id = client.post("/api/challenge/start").json()["challenge_id"]
    identified = client.post(
        "/api/scan/identify", files=IMAGE,
        data={"challenge_id": challenge_id, "area_id": "review"},
    )
    assert identified.status_code == 200
    draft = identified.json()

    repository = app.state.test_repository
    pending_state = repository.get(challenge_id)
    assert pending_state is not None
    assert pending_state.scan_results == []
    assert draft["draft_id"] in pending_state.pending_identifications

    confirmed = client.post("/api/scan/confirm", json={
        "challenge_id": challenge_id,
        "draft_id": draft["draft_id"],
        "product": {**draft["product"], "name": "用户修正后的名称"},
    })
    assert confirmed.status_code == 200
    assert confirmed.json()["product"]["name"] == "用户修正后的名称"
    assert confirmed.json()["confirmed_by_user"] is True

    repeated = client.post("/api/scan/confirm", json={
        "challenge_id": challenge_id,
        "draft_id": draft["draft_id"],
        "product": draft["product"],
    })
    assert_error(repeated, 409, "IDENTIFICATION_DRAFT_INVALID")


def test_history_survives_repository_recreation(client, tmp_path):
    database = tmp_path / "persistent.db"
    repository = ChallengeRepository(str(database))
    app.dependency_overrides[get_challenge_repository] = lambda: repository
    challenge_id = client.post("/api/challenge/start").json()["challenge_id"]

    recreated = ChallengeRepository(str(database))
    restored = recreated.get(challenge_id)
    assert restored is not None
    assert restored.challenge_id == challenge_id

    history = client.get("/api/challenge/history")
    assert history.status_code == 200
    assert history.json()[0]["challenge_id"] == challenge_id
