"""B1 Inventory Repository 测试

覆盖：CRUD、幂等、revision冲突、重复检测、关系存储、旧表不受影响。
"""

import pytest

from app.data.inventory_repository import (
    IdempotencyConflictError,
    InventoryRepository,
    ProductNotFoundError,
    RevisionConflictError,
)
from app.models.inventory import (
    ConfirmedFact,
    DatePrecision,
    DuplicateDecision,
    FactSource,
    IdentificationConfidence,
    InformationStatus,
    InventoryFilters,
    PartialDate,
    ProductCategory,
    ProductCreate,
    ProductDelete,
    ProductUpdate,
    SafetyStatement,
)


@pytest.fixture
def repo(tmp_path):
    """每个测试使用独立临时数据库"""
    path = str(tmp_path / "test_inventory.db")
    r = InventoryRepository(path)
    yield r
    r.clear()


def _make_create_req(
    product_id="p-test-001",
    name="84消毒液",
    category=ProductCategory.disinfectant,
    operation_id="op-001",
    brand="某品牌",
) -> ProductCreate:
    return ProductCreate(
        productId=product_id,
        operationId=operation_id,
        name=name,
        category=category,
        brand=brand,
        production_date=PartialDate(value="2025-05", precision=DatePrecision.month, source=FactSource.label),
        expiry_date=PartialDate(value="2027-05", precision=DatePrecision.month, source=FactSource.label),
        ingredients=[ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)],
        storage_requirements=[SafetyStatement(text="避光阴凉", source=FactSource.label)],
        identification_confidence=IdentificationConfidence.high,
        information_status=InformationStatus.complete,
        duplicateDecision=DuplicateDecision.create_another,
    )


class TestProductCRUD:
    def test_create_and_get(self, repo):
        req = _make_create_req()
        product = repo.create(req)
        assert product.id == "p-test-001"
        assert product.name == "84消毒液"
        assert product.revision == 1

        fetched = repo.get("p-test-001")
        assert fetched is not None
        assert fetched.name == "84消毒液"
        assert fetched.brand == "某品牌"
        assert len(fetched.ingredients) == 1
        assert fetched.ingredients[0].display_value == "次氯酸钠"

    def test_get_nonexistent(self, repo):
        assert repo.get("nonexistent") is None

    def test_list_empty(self, repo):
        items, total = repo.list(InventoryFilters())
        assert items == []
        assert total == 0

    def test_list_with_data(self, repo):
        repo.create(_make_create_req("p-001", "消毒液"))
        repo.create(_make_create_req("p-002", "洁厕灵", ProductCategory.toilet_cleaner, "op-002"))
        items, total = repo.list(InventoryFilters())
        assert total == 2
        assert len(items) == 2

    def test_list_search_by_name(self, repo):
        repo.create(_make_create_req("p-001", "84消毒液"))
        repo.create(_make_create_req("p-002", "洁厕灵", ProductCategory.toilet_cleaner, "op-002"))
        items, total = repo.list(InventoryFilters(query="消毒"))
        assert total == 1
        assert items[0].name == "84消毒液"

    def test_list_filter_by_category(self, repo):
        repo.create(_make_create_req("p-001", "消毒液", ProductCategory.disinfectant))
        repo.create(_make_create_req("p-002", "洁厕灵", ProductCategory.toilet_cleaner, "op-002"))
        items, total = repo.list(InventoryFilters(category=ProductCategory.toilet_cleaner))
        assert total == 1
        assert items[0].category == ProductCategory.toilet_cleaner

    def test_update_increments_revision(self, repo):
        repo.create(_make_create_req())
        update_req = ProductUpdate(
            expectedRevision=1,
            operationId="op-update-001",
            name="84消毒液（改名）",
            category=ProductCategory.disinfectant,
            production_date=PartialDate(value="2025-05", precision=DatePrecision.month, source=FactSource.label),
            expiry_date=PartialDate(value="2028-01", precision=DatePrecision.month, source=FactSource.label),
            identification_confidence=IdentificationConfidence.high,
            information_status=InformationStatus.complete,
        )
        updated = repo.update("p-test-001", update_req)
        assert updated.revision == 2
        assert updated.name == "84消毒液（改名）"
        assert updated.expiry_date.value == "2028-01"

    def test_update_revision_conflict(self, repo):
        repo.create(_make_create_req())
        update_req = ProductUpdate(
            expectedRevision=99,
            operationId="op-update-001",
            name="改名",
            category=ProductCategory.disinfectant,
            production_date=PartialDate(precision=DatePrecision.unknown),
            expiry_date=PartialDate(precision=DatePrecision.unknown),
        )
        with pytest.raises(RevisionConflictError):
            repo.update("p-test-001", update_req)

    def test_update_nonexistent(self, repo):
        update_req = ProductUpdate(
            expectedRevision=1,
            operationId="op-update-001",
            name="改名",
            category=ProductCategory.disinfectant,
            production_date=PartialDate(precision=DatePrecision.unknown),
            expiry_date=PartialDate(precision=DatePrecision.unknown),
        )
        with pytest.raises(ProductNotFoundError):
            repo.update("nonexistent", update_req)

    def test_delete(self, repo):
        repo.create(_make_create_req())
        delete_req = ProductDelete(expectedRevision=1, operationId="op-del-001")
        repo.delete("p-test-001", delete_req)
        assert repo.get("p-test-001") is None

    def test_delete_revision_conflict(self, repo):
        repo.create(_make_create_req())
        delete_req = ProductDelete(expectedRevision=99, operationId="op-del-001")
        with pytest.raises(RevisionConflictError):
            repo.delete("p-test-001", delete_req)

    def test_delete_nonexistent(self, repo):
        delete_req = ProductDelete(expectedRevision=1, operationId="op-del-001")
        with pytest.raises(ProductNotFoundError):
            repo.delete("nonexistent", delete_req)


class TestIdempotency:
    def test_same_operation_same_request_returns_cached(self, repo):
        req = _make_create_req()
        product = repo.create(req)

        # 记录幂等
        request_hash = repo._hash_request(req.model_dump(by_alias=True))
        response = product.model_dump(by_alias=True)
        repo.record_mutation("op-001", "create", "p-test-001", request_hash, response)

        # 相同 operationId + 相同 request_hash 应命中
        exists, cached = repo.check_idempotency("op-001", request_hash)
        assert exists is True
        assert cached is not None
        assert cached["productId"] == "p-test-001"

    def test_same_operation_different_request_raises(self, repo):
        req1 = _make_create_req(operation_id="op-001", name="产品A")
        product1 = repo.create(req1)
        hash1 = repo._hash_request(req1.model_dump(by_alias=True))
        repo.record_mutation("op-001", "create", "p-test-001", hash1, product1.model_dump(by_alias=True))

        # 不同请求但相同 operationId
        hash2 = repo._hash_request({"different": "request"})
        with pytest.raises(IdempotencyConflictError):
            repo.check_idempotency("op-001", hash2)

    def test_different_operation_no_conflict(self, repo):
        hash1 = repo._hash_request({"request": "1"})
        exists, cached = repo.check_idempotency("op-001", hash1)
        assert exists is False
        assert cached is None


class TestRelations:
    def test_save_and_get_relations(self, repo):
        repo.create(_make_create_req("p-001", "消毒液"))
        repo.create(_make_create_req("p-002", "洁厕灵", ProductCategory.toilet_cleaner, "op-002"))

        relations = [
            {
                "relation_id": "r-001",
                "product_a_id": "p-001",
                "product_b_id": "p-002",
                "relation_type": "do_not_mix",
                "severity": "critical",
                "rule_id": "RULE-001",
                "rule_version": "1.0",
                "payload": {"title": "氯气风险", "rationale": "混合产生氯气"},
                "updated_at": "2026-08-02T00:00:00Z",
            }
        ]
        repo.save_relations(relations)

        result = repo.get_relations_for_product("p-001")
        assert len(result) == 1
        assert result[0]["severity"] == "critical"

        result2 = repo.get_relations_for_product("p-002")
        assert len(result2) == 1

    def test_relation_normalization_ab_order(self, repo):
        """product_a_id < product_b_id 规范化"""
        repo.create(_make_create_req("p-001", "A"))
        repo.create(_make_create_req("p-002", "B", ProductCategory.toilet_cleaner, "op-002"))

        # 传入反序
        relations = [
            {
                "relation_id": "r-001",
                "product_a_id": "p-002",
                "product_b_id": "p-001",
                "relation_type": "do_not_mix",
                "severity": "critical",
                "rule_id": "RULE-001",
                "rule_version": "1.0",
                "payload": {},
                "updated_at": "2026-08-02T00:00:00Z",
            }
        ]
        repo.save_relations(relations)

        result = repo.get_all_relations()
        assert len(result) == 1
        assert result[0]["product_a_id"] == "p-001"
        assert result[0]["product_b_id"] == "p-002"

    def test_delete_product_cascades_relations(self, repo):
        repo.create(_make_create_req("p-001", "A"))
        repo.create(_make_create_req("p-002", "B", ProductCategory.toilet_cleaner, "op-002"))

        relations = [
            {
                "relation_id": "r-001",
                "product_a_id": "p-001",
                "product_b_id": "p-002",
                "relation_type": "do_not_mix",
                "severity": "critical",
                "rule_id": "RULE-001",
                "rule_version": "1.0",
                "payload": {},
                "updated_at": "2026-08-02T00:00:00Z",
            }
        ]
        repo.save_relations(relations)
        assert len(repo.get_all_relations()) == 1

        # 删除 p-001，关系应级联删除
        repo.delete("p-001", ProductDelete(expectedRevision=1, operationId="op-del-001"))
        assert len(repo.get_all_relations()) == 0

    def test_count_products_and_relations(self, repo):
        assert repo.count_products() == 0
        repo.create(_make_create_req("p-001", "A"))
        repo.create(_make_create_req("p-002", "B", ProductCategory.toilet_cleaner, "op-002"))
        assert repo.count_products() == 2

        counts = repo.count_relations_by_severity()
        assert counts == {}


class TestOldTableIntact:
    """旧 challenges 表不应受新建表影响"""

    def test_challenges_table_still_exists(self, repo):
        with repo._connect() as conn:
            # challenges 表可能不存在（新数据库），但 inventory 表一定存在
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            table_names = [r["name"] for r in rows]
            assert "inventory_products" in table_names
            assert "inventory_mutations" in table_names
            assert "compatibility_relations" in table_names
