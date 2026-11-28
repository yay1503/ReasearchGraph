import base64
import io
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, urlparse

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader

USER_AGENT = "ResearchGraph-Agent/1.0 (+https://github.com/hartej46/ReasearchGraph)"
DEFAULT_TIMEOUT = 15.0

ARXIV_ID_RE = re.compile(
    r"(?:arxiv\.org/(?:abs|pdf|html)/)?(\d{4}\.\d{4,5}(?:v\d+)?)",
    re.IGNORECASE,
)
GITHUB_REPO_RE = re.compile(
    r"github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)",
    re.IGNORECASE,
)


def _clean_text(text: str, limit: int = 4000) -> str:
    collapsed = re.sub(r"\s+", " ", text or "").strip()
    if len(collapsed) > limit:
        return collapsed[:limit].rstrip() + "..."
    return collapsed


async def fetch_arxiv_paper(arxiv_id: str) -> dict:
    """Fetch paper metadata and abstract from the arXiv Atom API."""
    clean_id = arxiv_id.removesuffix(".pdf")
    api_url = f"https://export.arxiv.org/api/query?id_list={quote_plus(clean_id)}"
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
        res = await client.get(api_url, headers={"User-Agent": USER_AGENT})
        res.raise_for_status()

    root = ET.fromstring(res.text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise ValueError(f"No arXiv entry found for ID '{clean_id}'")

    title = _clean_text(entry.findtext("atom:title", default="", namespaces=ns), 300)
    summary = _clean_text(entry.findtext("atom:summary", default="", namespaces=ns), 4000)
    published = (entry.findtext("atom:published", default="", namespaces=ns) or "")[:10]
    authors = [
        a.findtext("atom:name", default="", namespaces=ns).strip()
        for a in entry.findall("atom:author", ns)
    ]
    abs_url = f"https://arxiv.org/abs/{clean_id}"

    content_parts = []
    if authors:
        content_parts.append(f"Authors: {', '.join(authors[:6])}")
    if published:
        content_parts.append(f"Published: {published}")
    if summary:
        content_parts.append(f"Abstract: {summary}")

    return {
        "source_type": "arxiv",
        "url": abs_url,
        "title": title or f"arXiv:{clean_id}",
        "content": "\n".join(content_parts),
        "metadata": {
            "arxiv_id": clean_id,
            "authors": authors[:10],
            "published": published,
            "pdf_url": f"https://arxiv.org/pdf/{clean_id}.pdf",
        },
    }


async def fetch_github_repo(owner: str, repo: str) -> dict:
    """Fetch repository metadata, README, and dependency manifest from GitHub."""
    repo_clean = repo.removesuffix(".git")
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.github+json",
    }
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
        repo_res = await client.get(
            f"https://api.github.com/repos/{owner}/{repo_clean}",
            headers=headers,
        )
        repo_res.raise_for_status()
        info = repo_res.json()

        readme_text = ""
        readme_res = await client.get(
            f"https://api.github.com/repos/{owner}/{repo_clean}/readme",
            headers=headers,
        )
        if readme_res.status_code == 200:
            readme_json = readme_res.json()
            encoded = readme_json.get("content", "")
            if encoded:
                try:
                    readme_text = base64.b64decode(encoded).decode("utf-8", errors="replace")
                except Exception:
                    readme_text = ""

        deps_summary = []
        for dep_file in ("requirements.txt", "pyproject.toml", "package.json"):
            dep_res = await client.get(
                f"https://raw.githubusercontent.com/{owner}/{repo_clean}/{info.get('default_branch', 'main')}/{dep_file}",
                headers={"User-Agent": USER_AGENT},
            )
            if dep_res.status_code == 200 and dep_res.text.strip():
                deps_summary.append(f"{dep_file}: {_clean_text(dep_res.text, 600)}")
                break

    description = info.get("description") or ""
    stars = info.get("stargazers_count", 0)
    language = info.get("language") or "Unknown"

    parts = [f"Repo: {info.get('full_name', f'{owner}/{repo_clean}')} ({language}, ★ {stars})"]
    if description:
        parts.append(f"Description: {description}")
    if deps_summary:
        parts.append(deps_summary[0])
    if readme_text:
        parts.append(f"README excerpt:\n{_clean_text(readme_text, 2800)}")

    return {
        "source_type": "github",
        "url": info.get("html_url") or f"https://github.com/{owner}/{repo_clean}",
        "title": info.get("full_name") or f"{owner}/{repo_clean}",
        "content": "\n\n".join(parts),
        "metadata": {
            "owner": owner,
            "repo": repo_clean,
            "stars": stars,
            "language": language,
            "topics": info.get("topics", [])[:8],
        },
    }


async def fetch_webpage(url: str) -> dict:
    """Fetch a webpage and extract its title and clean body text."""
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
        res = await client.get(url, headers={"User-Agent": USER_AGENT})
        res.raise_for_status()

    soup = BeautifulSoup(res.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
        tag.decompose()

    title = ""
    if soup.title and soup.title.string:
        title = _clean_text(soup.title.string, 200)

    meta_desc = ""
    meta_tag = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    if meta_tag and meta_tag.get("content"):
        meta_desc = _clean_text(meta_tag["content"], 500)

    body_text = _clean_text(soup.get_text(" ", strip=True), 3500)
    content = f"{meta_desc}\n\n{body_text}".strip() if meta_desc else body_text

    return {
        "source_type": "webpage",
        "url": str(res.url),
        "title": title or urlparse(url).netloc or url,
        "content": content,
        "metadata": {"domain": urlparse(str(res.url)).netloc},
    }


async def fetch_url(url: str) -> dict:
    """Smart fetcher supporting arXiv, GitHub repos, and general webpages."""
    raw = (url or "").strip()
    if not raw:
        raise ValueError("URL is required")

    arxiv_match = ARXIV_ID_RE.search(raw)
    if arxiv_match and ("arxiv.org" in raw.lower() or raw.replace(".", "").isdigit()):
        return await fetch_arxiv_paper(arxiv_match.group(1))

    gh_match = GITHUB_REPO_RE.search(raw)
    if gh_match:
        return await fetch_github_repo(gh_match.group(1), gh_match.group(2))

    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"

    return await fetch_webpage(raw)


async def search_arxiv(query: str, max_results: int = 5) -> list[dict]:
    """Search arXiv papers via the official Atom API."""
    api_url = (
        f"https://export.arxiv.org/api/query?"
        f"search_query=all:{quote_plus(query)}&start=0&max_results={max_results}"
    )
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
        res = await client.get(api_url, headers={"User-Agent": USER_AGENT})
        res.raise_for_status()

    root = ET.fromstring(res.text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    results = []
    for entry in root.findall("atom:entry", ns):
        url = (entry.findtext("atom:id", default="", namespaces=ns) or "").strip()
        title = _clean_text(entry.findtext("atom:title", default="", namespaces=ns), 250)
        summary = _clean_text(entry.findtext("atom:summary", default="", namespaces=ns), 500)
        published = (entry.findtext("atom:published", default="", namespaces=ns) or "")[:10]
        authors = [
            a.findtext("atom:name", default="", namespaces=ns).strip()
            for a in entry.findall("atom:author", ns)
        ]
        results.append(
            {
                "title": title,
                "url": url,
                "published": published,
                "authors": authors[:4],
                "summary": summary,
            }
        )
    return results


async def search_github(query: str, max_results: int = 5) -> list[dict]:
    """Search public GitHub repositories."""
    api_url = (
        f"https://api.github.com/search/repositories?"
        f"q={quote_plus(query)}&sort=stars&order=desc&per_page={max_results}"
    )
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
        res = await client.get(
            api_url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/vnd.github+json",
            },
        )
        res.raise_for_status()
        items = res.json().get("items", [])

    return [
        {
            "name": item.get("full_name"),
            "url": item.get("html_url"),
            "description": _clean_text(item.get("description") or "", 300),
            "stars": item.get("stargazers_count", 0),
            "language": item.get("language") or "Unknown",
        }
        for item in items
    ]


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """Search the web via DuckDuckGo HTML with Wikipedia fallback."""
    results = []
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            res = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if res.status_code == 200:
                soup = BeautifulSoup(res.text, "html.parser")
                for item in soup.select(".result")[:max_results]:
                    link = item.select_one(".result__a")
                    snippet = item.select_one(".result__snippet")
                    if link:
                        results.append(
                            {
                                "title": _clean_text(link.get_text(" ", strip=True), 200),
                                "url": link.get("href", ""),
                                "snippet": _clean_text(
                                    snippet.get_text(" ", strip=True) if snippet else "",
                                    350,
                                ),
                            }
                        )
    except Exception:
        results = []

    if results:
        return results

    # Fallback to Wikipedia OpenSearch API
    wiki_url = (
        f"https://en.wikipedia.org/w/api.php?action=opensearch"
        f"&search={quote_plus(query)}&limit={max_results}&namespace=0&format=json"
    )
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
        wres = await client.get(wiki_url, headers={"User-Agent": USER_AGENT})
        wres.raise_for_status()
        payload = wres.json()

    titles = payload[1] if len(payload) > 1 else []
    descs = payload[2] if len(payload) > 2 else []
    urls = payload[3] if len(payload) > 3 else []
    return [
        {
            "title": titles[i],
            "url": urls[i] if i < len(urls) else "",
            "snippet": descs[i] if i < len(descs) else "",
        }
        for i in range(len(titles))
    ]


def extract_pdf_upload(file_bytes: bytes, filename: str) -> dict:
    """Extract title, page count, and text preview from an uploaded PDF file."""
    reader = PdfReader(io.BytesIO(file_bytes))
    num_pages = len(reader.pages)
    extracted_pages = []
    for page in reader.pages[:8]:
        txt = page.extract_text() or ""
        if txt.strip():
            extracted_pages.append(txt.strip())

    meta_title = ""
    if reader.metadata and getattr(reader.metadata, "title", None):
        meta_title = str(reader.metadata.title).strip()

    clean_name = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
    title = meta_title or clean_name or "Uploaded Research PDF"
    content = _clean_text("\n\n".join(extracted_pages), 5000)

    return {
        "source_type": "pdf",
        "title": title[:240],
        "content": content,
        "metadata": {
            "filename": filename,
            "pages": num_pages,
        },
    }

