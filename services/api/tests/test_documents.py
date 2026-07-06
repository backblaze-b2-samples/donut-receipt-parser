"""Route + service tests for the Document entity.

Donut inference and every B2 call are monkeypatched with an in-memory fake, so
this suite needs neither torch nor a real bucket. A separate opt-in test
(test_donut_real.py) exercises the actual model end-to-end.
"""

from datetime import UTC, datetime

import pytest

from app.service import documents as docs_service
from app.service import extraction
from app.types import FileMetadata

FAKE_CORD = {
    "menu": [
        {"nm": "Latte", "cnt": "1", "price": "4.50"},
        {"nm": "Blueberry Muffin", "cnt": "2", "price": "6.00"},
    ],
    "sub_total": {"subtotal_price": "10.50", "tax_price": "0.84"},
    "total": {"total_price": "11.34"},
}


class FakeBucket:
    def __init__(self):
        self.store: dict[str, bytes] = {}
        self.times: dict[str, datetime] = {}

    def put(self, data, key, content_type, metadata=None):
        self.store[key] = data
        self.times[key] = datetime.now(UTC)

    def get(self, key):
        if key not in self.store:
            raise RuntimeError(f"missing {key}")
        return self.store[key]

    def delete(self, key):
        self.store.pop(key, None)
        self.times.pop(key, None)

    def list(self, prefix="", max_keys=1000):
        out = []
        for key, data in self.store.items():
            if not key.startswith(prefix):
                continue
            out.append(
                FileMetadata(
                    key=key,
                    filename=key.rsplit("/", 1)[-1],
                    folder=key.rsplit("/", 1)[0] + "/" if "/" in key else "",
                    size_bytes=len(data),
                    size_human=f"{len(data)} B",
                    content_type="image/png",
                    uploaded_at=self.times[key],
                    url=None,
                )
            )
        return out

    def head(self, key):
        if key not in self.store:
            return None
        return next(m for m in self.list() if m.key == key)


@pytest.fixture
def bucket(monkeypatch):
    b = FakeBucket()

    # extraction layer
    monkeypatch.setattr(extraction, "list_files", b.list)
    monkeypatch.setattr(extraction, "get_object_bytes", b.get)
    monkeypatch.setattr(extraction, "put_object_bytes", b.put)
    monkeypatch.setattr(extraction, "run_donut", lambda _image: (FAKE_CORD, "cpu"))

    # documents layer
    monkeypatch.setattr(docs_service, "list_files", b.list)
    monkeypatch.setattr(docs_service, "put_object_bytes", b.put)
    monkeypatch.setattr(docs_service, "delete_file", b.delete)
    monkeypatch.setattr(docs_service, "get_file_metadata", b.head)
    monkeypatch.setattr(
        docs_service, "get_presigned_url", lambda key, filename=None: "https://ex.test/img"
    )
    return b


def _make_doc(client_bucket) -> str:
    """Seed a raw document directly and return its doc_id."""
    key = "raw-documents/acct-1/receipt/20260706T120000Z-r.png"
    client_bucket.put(b"\x89PNG fake", key, "image/png")
    return extraction.doc_id_for_key(key)


# --- unit: CORD mapping ---------------------------------------------------

def test_map_cord_extracts_line_items_and_totals():
    mapped = extraction.map_cord(FAKE_CORD)
    assert len(mapped["line_items"]) == 2
    assert mapped["line_items"][0].name == "Latte"
    assert mapped["line_items"][0].qty == "1"
    assert mapped["subtotal"] == "10.50"
    assert mapped["tax"] == "0.84"
    assert mapped["total"] == "11.34"


def test_map_cord_handles_single_menu_dict():
    mapped = extraction.map_cord({"menu": {"nm": "Water", "price": "1.00"}})
    assert len(mapped["line_items"]) == 1
    assert mapped["line_items"][0].name == "Water"


def test_donut_adapter_is_importable_without_torch():
    from app.repo import donut_model

    assert callable(donut_model.run_donut)
    assert callable(donut_model.get_device)


# --- routes ---------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_document(client, bucket):
    resp = await client.post(
        "/documents",
        files={"file": ("receipt.png", b"\x89PNG fake bytes", "image/png")},
        data={"submitter_id": "acct-team-01", "document_type": "receipt"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["submitter_id"] == "acct-team-01"
    assert body["document_type"] == "receipt"
    assert body["source_key"].startswith("raw-documents/acct-team-01/receipt/")
    assert any(k.startswith("raw-documents/") for k in bucket.store)


@pytest.mark.asyncio
async def test_create_rejects_non_image(client, bucket):
    resp = await client.post(
        "/documents",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"submitter_id": "acct-1", "document_type": "receipt"},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_list_documents_status(client, bucket):
    doc_id = _make_doc(bucket)
    resp = await client.get("/documents")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["doc_id"] == doc_id
    assert rows[0]["status"] == "unparsed"


@pytest.mark.asyncio
async def test_parse_then_read(client, bucket):
    doc_id = _make_doc(bucket)
    parse = await client.post(f"/documents/{doc_id}/parse")
    assert parse.status_code == 200
    extracted = parse.json()["extracted"]
    assert extracted["total"] == "11.34"
    assert extracted["device"] == "cpu"
    assert len(extracted["line_items"]) == 2
    # extracted JSON + manifest written to B2
    assert any(k.startswith("extracted/") for k in bucket.store)
    assert any(k.startswith("manifests/") for k in bucket.store)

    detail = await client.get(f"/documents/{doc_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "parsed"
    assert body["image_url"] == "https://ex.test/img"
    assert body["extracted"]["subtotal"] == "10.50"


@pytest.mark.asyncio
async def test_parse_batch(client, bucket):
    _make_doc(bucket)
    bucket.put(
        b"\x89PNG two", "raw-documents/acct-2/invoice/20260706T120100Z-b.png", "image/png"
    )
    resp = await client.post("/documents/parse-batch")
    assert resp.status_code == 200
    body = resp.json()
    assert body["parsed"] == 2
    assert body["failed"] == 0


@pytest.mark.asyncio
async def test_correct_fields(client, bucket):
    doc_id = _make_doc(bucket)
    await client.post(f"/documents/{doc_id}/parse")
    resp = await client.patch(
        f"/documents/{doc_id}",
        json={"merchant": "Blue Bottle", "currency": "EUR", "total": "12.00"},
    )
    assert resp.status_code == 200
    extracted = resp.json()["extracted"]
    assert extracted["merchant"] == "Blue Bottle"
    assert extracted["currency"] == "EUR"
    assert extracted["total"] == "12.00"
    assert extracted["corrected"] is True


@pytest.mark.asyncio
async def test_delete_document_removes_raw_and_extracted(client, bucket):
    doc_id = _make_doc(bucket)
    await client.post(f"/documents/{doc_id}/parse")
    assert any(k.startswith("extracted/") for k in bucket.store)

    resp = await client.delete(f"/documents/{doc_id}")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": True, "doc_id": doc_id}
    assert not any(k.startswith("raw-documents/") for k in bucket.store)
    assert not any(k.startswith("extracted/") for k in bucket.store)


@pytest.mark.asyncio
async def test_get_missing_document_404(client, bucket):
    resp = await client.get("/documents/deadbeefdeadbeef")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_pipeline_stats(client, bucket):
    doc_id = _make_doc(bucket)
    await client.post(f"/documents/{doc_id}/parse")
    resp = await client.get("/documents/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["documents_ingested"] == 1
    assert body["documents_parsed"] == 1
    assert body["parse_coverage"] == 100.0
    assert len(body["recent_extractions"]) == 1
