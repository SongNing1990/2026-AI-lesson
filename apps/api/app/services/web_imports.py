import html
import re
from html.parser import HTMLParser
from typing import List, Tuple
from urllib.parse import quote, unquote, urlsplit, urlunsplit
from urllib.request import Request, urlopen


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "noscript"}:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self.skip_depth > 0:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            text = data.strip()
            if text:
                self.parts.append(text)


class TitleExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_parts = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            text = data.strip()
            if text:
                self.title_parts.append(text)


def normalize_url(raw_url: str) -> str:
    value = raw_url.strip()
    value = value.strip("<>\"'“”‘’")
    value = value.rstrip("，。；、,.;")
    if not value:
        raise ValueError("URL is empty.")
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL is invalid.")
    encoded_path = quote(unquote(parsed.path or "/"), safe="/%:@()+-._~")
    encoded_query = quote(unquote(parsed.query), safe="=&%:@()+,/?-._~")
    encoded_fragment = quote(unquote(parsed.fragment), safe="=%:@()+,/?-._~")
    return urlunsplit((parsed.scheme, parsed.netloc, encoded_path, encoded_query, encoded_fragment))


def build_fetch_candidates(raw_url: str) -> List[str]:
    normalized = normalize_url(raw_url)
    candidates = [normalized]
    if normalized.startswith("https://"):
        candidates.append("http://" + normalized.removeprefix("https://"))
    return candidates


def fetch_webpage(url: str) -> Tuple[str, str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; LocalKB/0.1; +https://localhost)",
        },
    )
    with urlopen(request, timeout=15) as response:
        payload = response.read()
        content_type = response.headers.get_content_type() or "text/html"
        charset = response.headers.get_content_charset() or "utf-8"
    html_text = payload.decode(charset, errors="ignore")
    title_extractor = TitleExtractor()
    title_extractor.feed(html_text)
    extractor = TextExtractor()
    extractor.feed(html_text)
    text = " ".join(extractor.parts)
    text = html.unescape(re.sub(r"\s+", " ", text)).strip()
    preview_text = text[:8000]
    if not preview_text:
        raise ValueError("Web page content is empty.")
    title = " ".join(title_extractor.title_parts).strip() or url
    return title, content_type, preview_text
