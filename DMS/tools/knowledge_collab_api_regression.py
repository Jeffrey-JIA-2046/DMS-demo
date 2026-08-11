#!/usr/bin/env python3
"""Knowledge Collaboration API regression test.

Usage:
  python tools/knowledge_collab_api_regression.py --base-url http://localhost:8080 --user wong1 --password P@ssw0rd
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import requests


@dataclass
class TestResult:
    name: str
    ok: bool
    status: int | None
    note: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Knowledge Collaboration API regression checks")
    parser.add_argument("--base-url", default="http://localhost:8080", help="Backend base URL")
    parser.add_argument("--user", default="wong1", help="Username for Basic auth")
    parser.add_argument("--password", default="P@ssw0rd", help="Password for Basic auth")
    parser.add_argument("--timeout", type=int, default=30, help="Request timeout in seconds")
    parser.add_argument("--json-only", action="store_true", help="Print only JSON report")
    return parser.parse_args()


def parse_json_response(resp: requests.Response) -> Any:
    if not resp.content:
        return None
    ctype = resp.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            return resp.json()
        except ValueError:
            return None
    return None


def main() -> int:
    args = parse_args()
    auth = (args.user, args.password)
    base = args.base_url.rstrip("/")

    results: list[TestResult] = []
    ctx: dict[str, Any] = {"topic_id": None, "doc_id": None, "link_id": None, "upload_id": None}

    def add(name: str, ok: bool, status: int | None = None, note: str = "") -> None:
        results.append(TestResult(name=name, ok=ok, status=status, note=note))

    def req(method: str, path: str, expected: tuple[int, ...] = (200,), **kwargs: Any) -> tuple[requests.Response, bool, Any]:
        resp = requests.request(method, base + path, auth=auth, timeout=args.timeout, **kwargs)
        data = parse_json_response(resp)
        return resp, resp.status_code in expected, data

    # Auth + baseline
    try:
        resp = requests.get(base + "/api/me", auth=auth, timeout=args.timeout)
        body = parse_json_response(resp) or {}
        add("GET /api/me", resp.status_code == 200, resp.status_code, f"role={body.get('role')}")
    except Exception as ex:
        add("GET /api/me", False, None, str(ex))

    resp, ok, data = req("GET", "/api/knowledge/topics?page=0&size=10")
    add("GET /api/knowledge/topics", ok, resp.status_code, f"count={len((data or {}).get('content') or [])}")

    resp, ok, data = req("GET", "/api/documents?page=0&size=10")
    docs = (data or {}).get("content") or []
    if ok and docs:
        ctx["doc_id"] = docs[0].get("id")
        add("GET /api/documents", True, resp.status_code, f"doc_id={ctx['doc_id']}")
    elif ok:
        add("GET /api/documents", False, resp.status_code, "no document available")
    else:
        add("GET /api/documents", False, resp.status_code, "request failed")

    # Create topic
    suffix = datetime.now().strftime("%Y%m%d%H%M%S")
    payload = {
        "title": f"API Regression Topic {suffix}",
        "description": "Automated regression test topic",
        "tags": ["api-regression", "automation"],
    }
    resp, ok, data = req("POST", "/api/knowledge/topics", json=payload)
    if ok and isinstance(data, dict):
        ctx["topic_id"] = data.get("id")
    add("POST /api/knowledge/topics", ok and bool(ctx["topic_id"]), resp.status_code, f"topic_id={ctx['topic_id']}")

    topic_id = ctx["topic_id"]
    if not topic_id:
        report = {
            "summary": {
                "passed": sum(1 for item in results if item.ok),
                "failed": sum(1 for item in results if not item.ok),
                "total": len(results),
            },
            "context": ctx,
            "results": [item.__dict__ for item in results],
        }
        print(json.dumps(report, indent=2))
        return 1

    resp, ok, data = req("GET", f"/api/knowledge/topics/{topic_id}")
    add("GET /api/knowledge/topics/{id}", ok, resp.status_code, f"title={(data or {}).get('title')}")

    # Join first so all mutation endpoints are valid.
    resp, ok, data = req("POST", f"/api/knowledge/topics/{topic_id}/join")
    add(
        "POST /api/knowledge/topics/{id}/join",
        ok and bool((data or {}).get("member") is True),
        resp.status_code,
        f"member={(data or {}).get('member')}; memberCount={(data or {}).get('memberCount')}",
    )

    resp, ok, data = req(
        "PUT",
        f"/api/knowledge/topics/{topic_id}",
        json={"title": f"API Regression Topic Updated {suffix}", "description": "Updated by regression script", "tags": ["api-regression", "updated"]},
    )
    add("PUT /api/knowledge/topics/{id}", ok, resp.status_code, f"title={(data or {}).get('title')}")

    resp, ok, data = req("POST", f"/api/knowledge/topics/{topic_id}/stars")
    add("POST /api/knowledge/topics/{id}/stars", ok and bool((data or {}).get("starredByMe") is True), resp.status_code, f"starredByMe={(data or {}).get('starredByMe')}")

    resp, ok, data = req("DELETE", f"/api/knowledge/topics/{topic_id}/stars")
    add("DELETE /api/knowledge/topics/{id}/stars", ok and bool((data or {}).get("starredByMe") is False), resp.status_code, f"starredByMe={(data or {}).get('starredByMe')}")

    resp, ok, data = req(
        "POST",
        f"/api/knowledge/topics/{topic_id}/contributions",
        json={"content": "Automated regression contribution", "linkedDocumentId": ctx["doc_id"]},
    )
    add("POST /api/knowledge/topics/{id}/contributions", ok, resp.status_code, f"contributions={len((data or {}).get('contributions') or [])}")

    resp, ok, data = req(
        "POST",
        f"/api/knowledge/topics/{topic_id}/share",
        json={"recipientUsernames": [args.user], "message": "Share self for regression"},
    )
    add("POST /api/knowledge/topics/{id}/share", ok, resp.status_code, f"shares={len((data or {}).get('shares') or [])}")

    resp, ok, data = req(
        "POST",
        f"/api/knowledge/topics/{topic_id}/links",
        json={"documentId": ctx["doc_id"], "note": "linked by regression script"},
    )
    links = (data or {}).get("documentLinks") or []
    for item in links:
        if item.get("documentId") == ctx["doc_id"]:
            ctx["link_id"] = item.get("id")
            break
    add("POST /api/knowledge/topics/{id}/links", ok and bool(ctx["link_id"]), resp.status_code, f"link_id={ctx['link_id']}")

    if ctx["link_id"]:
        resp, ok, data = req("DELETE", f"/api/knowledge/topics/{topic_id}/links/{ctx['link_id']}")
        add("DELETE /api/knowledge/topics/{id}/links/{linkId}", ok, resp.status_code, "unlinked")
    else:
        add("DELETE /api/knowledge/topics/{id}/links/{linkId}", False, None, "skipped: no link id")

    files = {"file": ("knowledge-api-regression.txt", b"knowledge collaboration regression upload", "text/plain")}
    resp = requests.post(
        base + f"/api/knowledge/topics/{topic_id}/documents",
        auth=auth,
        timeout=args.timeout,
        files=files,
        data={"description": "attachment from regression script"},
    )
    upload_ok = resp.status_code == 200
    upload_data = parse_json_response(resp) or {}
    uploads = upload_data.get("uploads") or []
    if uploads and isinstance(uploads[0], dict):
        ctx["upload_id"] = uploads[0].get("id")
    add("POST /api/knowledge/topics/{id}/documents", upload_ok and bool(ctx["upload_id"]), resp.status_code, f"upload_id={ctx['upload_id']}")

    resp = requests.get(base + f"/api/knowledge/topics/{topic_id}/chain/download", auth=auth, timeout=args.timeout)
    add("GET /api/knowledge/topics/{id}/chain/download", resp.status_code == 200 and len(resp.content) > 0, resp.status_code, f"bytes={len(resp.content)}")

    if ctx["upload_id"]:
        resp = requests.get(
            base + f"/api/knowledge/topics/{topic_id}/documents/{ctx['upload_id']}/download",
            auth=auth,
            timeout=args.timeout,
        )
        add(
            "GET /api/knowledge/topics/{topicId}/documents/{uploadId}/download",
            resp.status_code == 200 and len(resp.content) > 0,
            resp.status_code,
            f"bytes={len(resp.content)}",
        )
    else:
        add("GET /api/knowledge/topics/{topicId}/documents/{uploadId}/download", False, None, "skipped: no upload id")

    passed = sum(1 for item in results if item.ok)
    failed = sum(1 for item in results if not item.ok)

    report = {
        "summary": {"passed": passed, "failed": failed, "total": len(results)},
        "context": ctx,
        "results": [item.__dict__ for item in results],
    }

    if not args.json_only:
        print(f"Knowledge Collaboration API regression: {passed}/{len(results)} passed")
    print(json.dumps(report, indent=2))

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
