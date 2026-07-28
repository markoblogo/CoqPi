#!/usr/bin/env python3
import asyncio
import json
import sys


async def run(url: str) -> dict:
    try:
        from crawl4ai import AsyncWebCrawler
    except Exception as exc:  # pragma: no cover
        return {"error": f"crawl4ai import failed: {exc}"}

    try:
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url)
    except Exception as exc:  # pragma: no cover
        return {"error": f"crawl4ai crawl failed: {exc}"}

    markdown = getattr(result, "markdown", None)
    if hasattr(markdown, "raw_markdown"):
        markdown = markdown.raw_markdown

    if not isinstance(markdown, str) or not markdown.strip():
        return {"error": "crawl4ai returned empty markdown"}

    return {"markdown": markdown}


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: crawl4ai_markdown_adapter.py <url>"}))
        return 1

    payload = asyncio.run(run(sys.argv[1]))
    print(json.dumps(payload))
    return 0 if "error" not in payload else 1


if __name__ == "__main__":
    raise SystemExit(main())
