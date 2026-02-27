from __future__ import annotations

import asyncio
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

import httpx


@dataclass(slots=True)
class CCFVenue:
    abbr: str
    full_name: str
    publisher: str
    venue_type: str  # conference | journal
    domain: str
    url: str
    xml_url: str


class CCFDblpCrawler:
    """Crawl CCF-listed venues via DBLP venue index XML."""

    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
    DETAIL_FETCH_CONCURRENCY = 4
    DETAIL_BATCH_SIZE = 120
    MAX_DETAIL_URLS = 2
    REQUEST_HEADERS = {
        "User-Agent": "PaperPandaBot/1.0 (+https://github.com/)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    DOMAIN_MAP = {
        "网络与信息安全": "security",
        "计算机图形学与多媒体": "graphics",
        "人工智能": "ai",
    }

    def __init__(
        self,
        *,
        detail_fetch_concurrency: int | None = None,
        detail_batch_size: int | None = None,
        max_detail_urls: int | None = None,
        request_max_retries: int = 5,
        request_backoff_sec: float = 1.0,
        venue_request_delay_sec: float = 0.35,
    ) -> None:
        self.detail_fetch_concurrency = max(1, detail_fetch_concurrency or self.DETAIL_FETCH_CONCURRENCY)
        self.detail_batch_size = max(1, detail_batch_size or self.DETAIL_BATCH_SIZE)
        self.max_detail_urls = max(1, max_detail_urls or self.MAX_DETAIL_URLS)
        self.request_max_retries = max(1, int(request_max_retries))
        self.request_backoff_sec = max(0.1, float(request_backoff_sec))
        self.venue_request_delay_sec = max(0.0, float(venue_request_delay_sec))

    async def fetch_metadata(
        self,
        venues: list[CCFVenue],
        year_from: int = 2020,
        year_to: int | None = None,
    ) -> list[dict[str, Any]]:
        if year_to is None:
            year_to = date.today().year
        year_from = max(1900, year_from)
        year_to = max(year_to, year_from)

        all_records: list[dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
            total = len(venues)
            for index, venue in enumerate(venues, start=1):
                response = await self._request_with_retry(
                    client=client,
                    url=venue.xml_url,
                    timeout=90,
                    context=f"{venue.abbr} index.xml",
                )
                if response is None:
                    print(f"[ccf] ({index}/{total}) {venue.abbr} failed after retries")
                    continue

                parsed = self._parse_venue_xml(
                    xml_bytes=response.content,
                    venue=venue,
                    year_from=year_from,
                    year_to=year_to,
                )
                parsed, resolved = await self._enrich_abstracts(parsed, client=client)
                all_records.extend(parsed)
                print(f"[ccf] ({index}/{total}) {venue.abbr} -> {len(parsed)} records (abstract from homepage: {resolved})")
                if self.venue_request_delay_sec > 0:
                    await asyncio.sleep(self.venue_request_delay_sec)
        return all_records

    def parse_venues(self, resource_path: Path) -> list[CCFVenue]:
        text = resource_path.read_text(encoding="utf-8")
        lines = text.splitlines()

        venues: list[CCFVenue] = []
        current_domain = "general"
        current_type: str | None = None
        for raw in lines:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("## "):
                title = line[3:].strip()
                current_domain = self.DOMAIN_MAP.get(title, "general")
                continue
            if line.startswith("### "):
                title = line[4:].strip()
                if "期刊" in title:
                    current_type = "journal"
                elif "会议" in title:
                    current_type = "conference"
                else:
                    current_type = None
                continue
            if current_type is None or not line.startswith("|"):
                continue

            cols = [col.strip() for col in line.strip("|").split("|")]
            if len(cols) < 4:
                continue
            if cols[0] == "简称" or cols[1] == "全称":
                continue
            if all(re.fullmatch(r"-+", col or "-") for col in cols):
                continue

            abbr = cols[0] or self._infer_abbr(cols[1])
            full_name = cols[1]
            publisher = cols[2]
            url = cols[3]
            if not full_name or not url:
                continue

            xml_url = self._to_dblp_xml_url(url)
            if not xml_url:
                continue
            venues.append(
                CCFVenue(
                    abbr=abbr,
                    full_name=full_name,
                    publisher=publisher,
                    venue_type=current_type,
                    domain=current_domain,
                    url=url,
                    xml_url=xml_url,
                )
            )

        dedup: dict[str, CCFVenue] = {}
        for venue in venues:
            dedup[venue.xml_url] = venue
        return list(dedup.values())

    def _parse_venue_xml(
        self,
        xml_bytes: bytes,
        venue: CCFVenue,
        year_from: int,
        year_to: int,
    ) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        stream = BytesIO(xml_bytes)
        for _, elem in ET.iterparse(stream, events=("end",)):
            tag = self._strip_ns(elem.tag)
            if tag not in {"article", "inproceedings"}:
                elem.clear()
                continue
            record = self._entry_to_record(
                entry=elem,
                venue=venue,
                year_from=year_from,
                year_to=year_to,
            )
            if record:
                records.append(record)
            elem.clear()
        return records

    def _entry_to_record(
        self,
        entry: ET.Element,
        venue: CCFVenue,
        year_from: int,
        year_to: int,
    ) -> dict[str, Any] | None:
        key = str(entry.attrib.get("key", "")).strip()
        mdate = self._safe_date(entry.attrib.get("mdate"))

        title = ""
        authors: list[str] = []
        year: int | None = None
        doi = ""
        ee_links: list[str] = []

        for child in entry:
            tag = self._strip_ns(child.tag)
            text = self._normalize_text("".join(child.itertext()))
            if not text:
                continue
            if tag == "title":
                title = text
            elif tag == "author":
                authors.append(text)
            elif tag == "year":
                parsed_year = self._safe_int(text)
                if parsed_year is not None:
                    year = parsed_year
            elif tag == "doi":
                doi = text
            elif tag == "ee":
                ee_links.append(text)

        if not title or year is None:
            return None
        if year < year_from or year > year_to:
            return None

        if not doi:
            doi = self._extract_doi(ee_links)
        pdf_url = self._pick_pdf_url(ee_links)
        if not pdf_url and ee_links:
            pdf_url = ee_links[0]
        detail_urls = self._collect_detail_urls(ee_links=ee_links, doi=doi)

        base_id = key or doi or pdf_url or f"{venue.abbr}|{year}|{title}"
        paper_id = hashlib.md5(base_id.encode("utf-8")).hexdigest()

        published_date = date(year, 1, 1)
        updated_date = mdate or published_date
        primary_category = f"ccf.{venue.domain}"[:64]
        venue_slug = self._slugify(venue.abbr or venue.full_name)
        categories = [primary_category, f"venue.{venue_slug}"]
        source = self._build_source(venue=venue, venue_slug=venue_slug)

        return {
            "arxiv_id": paper_id,
            "title": title,
            "abstract": title,
            "authors": list(dict.fromkeys(authors)),
            "categories": categories,
            "primary_category": primary_category,
            "published_date": published_date,
            "updated_date": updated_date,
            "pdf_url": pdf_url,
            "doi": doi,
            "source": source,
            "status": "active",
            "_detail_urls": detail_urls,
        }

    async def _enrich_abstracts(
        self,
        records: list[dict[str, Any]],
        client: httpx.AsyncClient,
    ) -> tuple[list[dict[str, Any]], int]:
        if not records:
            return records, 0

        semaphore = asyncio.Semaphore(self.detail_fetch_concurrency)
        resolved = 0

        async def enrich_one(record: dict[str, Any]) -> int:
            title = self._normalize_text(str(record.get("title", "")))
            abstract = self._normalize_text(str(record.get("abstract", "")))
            detail_urls = [str(url).strip() for url in record.get("_detail_urls", []) if str(url).strip()]

            from_homepage = 0
            if (not abstract or abstract == title) and detail_urls:
                fetched = await self._fetch_abstract_from_urls(
                    urls=detail_urls[: self.max_detail_urls],
                    client=client,
                    semaphore=semaphore,
                )
                if fetched:
                    abstract = fetched
                    from_homepage = 1

            if not abstract:
                abstract = title or "Abstract unavailable."

            record["abstract"] = self._sanitize_abstract(abstract)
            record.pop("_detail_urls", None)
            return from_homepage

        for start in range(0, len(records), self.detail_batch_size):
            batch = records[start : start + self.detail_batch_size]
            tasks = [asyncio.create_task(enrich_one(record)) for record in batch]
            for result in await asyncio.gather(*tasks):
                resolved += int(result)
        return records, resolved

    async def _fetch_abstract_from_urls(
        self,
        urls: list[str],
        client: httpx.AsyncClient,
        semaphore: asyncio.Semaphore,
    ) -> str:
        for raw_url in urls:
            url = str(raw_url).strip()
            if not url or self._is_pdf_url(url):
                continue
            async with semaphore:
                response = await self._request_with_retry(
                    client=client,
                    url=url,
                    timeout=20,
                    context="detail-page",
                )
            if response is None:
                continue

            content_type = str(response.headers.get("content-type", "")).lower()
            if "application/pdf" in content_type:
                continue

            abstract = self._extract_abstract_from_html(response.text)
            if abstract:
                return abstract
        return ""

    def _extract_abstract_from_html(self, html_text: str) -> str:
        text = str(html_text or "").strip()
        if not text:
            return ""

        try:
            from lxml import html as lxml_html

            doc = lxml_html.fromstring(text)
        except Exception:
            return ""

        meta_queries = [
            "//meta[translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='citation_abstract']/@content",
            "//meta[translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='dc.description']/@content",
            "//meta[translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='description']/@content",
            "//meta[translate(@property,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='og:description']/@content",
            "//meta[translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='twitter:description']/@content",
        ]
        for query in meta_queries:
            for value in doc.xpath(query):
                candidate = self._sanitize_abstract(str(value))
                if self._looks_like_abstract(candidate):
                    return candidate

        abstract_nodes = doc.xpath(
            "//*[contains(translate(@id,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'abstract')"
            " or contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'abstract')]"
        )
        for node in abstract_nodes[:8]:
            candidate = self._sanitize_abstract(" ".join(node.itertext()))
            if self._looks_like_abstract(candidate):
                return candidate

        for script_text in doc.xpath("//script[@type='application/ld+json']/text()"):
            if not script_text:
                continue
            try:
                payload = json.loads(script_text)
            except Exception:
                continue
            for value in self._json_descriptions(payload):
                candidate = self._sanitize_abstract(value)
                if self._looks_like_abstract(candidate):
                    return candidate
        return ""

    def _json_descriptions(self, payload: Any) -> list[str]:
        values: list[str] = []
        stack = [payload]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                desc = current.get("description")
                if isinstance(desc, str) and desc.strip():
                    values.append(desc)
                stack.extend(current.values())
            elif isinstance(current, list):
                stack.extend(current)
        return values

    def _collect_detail_urls(self, ee_links: list[str], doi: str) -> list[str]:
        values: list[str] = []
        for link in ee_links:
            url = str(link or "").strip()
            if not url or self._is_pdf_url(url):
                continue
            values.append(url)
        if doi:
            values.append(f"https://doi.org/{doi}")
        dedup: list[str] = []
        seen: set[str] = set()
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            dedup.append(value)
        return dedup

    @staticmethod
    def _is_pdf_url(url: str) -> bool:
        value = str(url or "").lower()
        return value.endswith(".pdf") or "/pdf/" in value

    @staticmethod
    def _looks_like_abstract(value: str) -> bool:
        text = str(value or "").strip()
        if len(text) < 80:
            return False
        blacklist = (
            "cookie",
            "javascript",
            "sign in",
            "subscribe",
            "all rights reserved",
            "download pdf",
        )
        lowered = text.lower()
        return not any(token in lowered for token in blacklist)

    def _build_source(self, venue: CCFVenue, venue_slug: str | None = None) -> str:
        prefix = "conference" if venue.venue_type == "conference" else "journal"
        slug = venue_slug or self._slugify(venue.abbr or venue.full_name)
        max_slug_len = max(1, 32 - len(prefix) - 1)
        slug = slug[:max_slug_len].strip("-") or "unknown"
        return f"{prefix}.{slug}"

    @staticmethod
    def _slugify(value: str) -> str:
        lowered = str(value or "").strip().lower()
        slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
        return slug or "unknown"

    def _sanitize_abstract(self, value: str, max_len: int = 6000) -> str:
        normalized = self._normalize_text(value)
        if len(normalized) > max_len:
            return normalized[:max_len].rstrip()
        return normalized

    async def _request_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        timeout: int | float,
        context: str,
    ) -> httpx.Response | None:
        target = str(url).strip()
        if not target:
            return None

        for attempt in range(1, self.request_max_retries + 1):
            try:
                response = await client.get(
                    target,
                    headers=self.REQUEST_HEADERS,
                    timeout=timeout,
                )
            except Exception as exc:
                if attempt >= self.request_max_retries:
                    print(f"[ccf] request failed ({context}): {exc}")
                    return None
                await asyncio.sleep(self.request_backoff_sec * attempt)
                continue

            code = int(response.status_code)
            if code in self.RETRYABLE_STATUS_CODES:
                if attempt >= self.request_max_retries:
                    print(f"[ccf] request failed ({context}): HTTP {code} {target}")
                    return None
                await asyncio.sleep(self.request_backoff_sec * attempt)
                continue

            try:
                response.raise_for_status()
            except Exception as exc:
                print(f"[ccf] request failed ({context}): {exc}")
                return None
            return response
        return None

    @staticmethod
    def _to_dblp_xml_url(raw_url: str) -> str:
        try:
            parsed = urlparse(raw_url.strip())
        except Exception:
            return ""
        path = parsed.path.strip()
        if not path.startswith("/db/"):
            return ""
        if path.endswith("index.html"):
            path = path[: -len("index.html")]
        if not path.endswith("/"):
            path = f"{path}/"
        return f"https://dblp.org{path}index.xml"

    @staticmethod
    def _infer_abbr(full_name: str) -> str:
        upper = "".join(ch for ch in full_name if ch.isupper())
        if len(upper) >= 2:
            return upper[:12]
        alnum = re.sub(r"[^a-zA-Z0-9]+", "", full_name)
        return (alnum[:12] or "UNKNOWN").upper()

    @staticmethod
    def _normalize_text(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    @staticmethod
    def _safe_int(value: str) -> int | None:
        try:
            return int(value)
        except Exception:
            return None

    @staticmethod
    def _safe_date(value: Any) -> date | None:
        if not value:
            return None
        raw = str(value).strip()
        if len(raw) < 10:
            return None
        try:
            return date.fromisoformat(raw[:10])
        except Exception:
            return None

    @staticmethod
    def _pick_pdf_url(links: list[str]) -> str:
        for link in links:
            value = link.lower()
            if value.endswith(".pdf") or "/pdf/" in value:
                return link
        return ""

    @staticmethod
    def _extract_doi(links: list[str]) -> str:
        for link in links:
            lower = link.lower()
            marker = "doi.org/"
            idx = lower.find(marker)
            if idx >= 0:
                return link[idx + len(marker) :].strip("/")
        return ""

    @staticmethod
    def _strip_ns(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]
