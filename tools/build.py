"""myBox 设计稿构建脚本

用法：
    python tools/build.py            # 拼装 src/ → index.html
    python tools/build.py --fonts    # 同时按页面实际用字重新生成自托管字体子集

为什么自托管字体：设计稿的主要读者在国内，fonts.googleapis.com 不稳定；
这里用 Google Fonts 的 text= / icon_names= 子集接口，只下载本页用到的字形。
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
FONTS = ROOT / "assets" / "fonts"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
INCLUDE = re.compile(r"<!--\s*@include\s+(\S+)\s*-->")


def assemble() -> str:
    def expand(text: str, base: Path, depth: int = 0) -> str:
        if depth > 4:
            raise RuntimeError("include 嵌套过深")

        def rep(m: re.Match) -> str:
            p = (base / m.group(1)).resolve()
            return expand(p.read_text(encoding="utf-8"), p.parent, depth + 1)

        return INCLUDE.sub(rep, text)

    html = expand((SRC / "index.src.html").read_text(encoding="utf-8"), SRC)
    (ROOT / "index.html").write_text(html, encoding="utf-8", newline="\n")
    return html


SERIF_TAGS = {"h1", "h2", "h3", "h4"}
SERIF_CLASSES = {"t-film", "hero-title", "ci-cap", "ph", "num", "serif"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class SerifCollector(HTMLParser):
    """收集出现在衬线字体语境（标题、片名）里的字符。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[bool] = []
        self.chars: set[str] = set()

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        cls = set((dict(attrs).get("class") or "").split())
        inside = (self.stack[-1] if self.stack else False) or tag in SERIF_TAGS or bool(cls & SERIF_CLASSES)
        self.stack.append(inside)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.stack and self.stack[-1]:
            self.chars.update(data)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def gfont(family_query: str, out: Path, text: str | None = None, icons: list[str] | None = None) -> None:
    q = f"family={family_query}&display=block"
    if text is not None:
        q += "&text=" + urllib.parse.quote(text)
    if icons:
        q += "&icon_names=" + ",".join(sorted(set(icons)))
    css = fetch("https://fonts.googleapis.com/css2?" + q).decode("utf-8")
    urls = re.findall(r"url\((https://[^)]+)\)", css)
    if len(urls) != 1:
        raise RuntimeError(f"{out.name}: 期望 1 个字体文件，得到 {len(urls)} 个\n{css[:400]}")
    data = fetch(urls[0])
    out.write_bytes(data)
    print(f"  {out.name:34s} {len(data) / 1024:7.1f} KB")


def fonts(html: str) -> None:
    FONTS.mkdir(parents=True, exist_ok=True)
    posters = (ROOT / "assets" / "js" / "posters.js").read_text(encoding="utf-8")
    titles = "".join(re.findall(r"t: '([^']+)'", posters)) + "梦"

    col = SerifCollector()
    col.feed(html)
    serif = sorted({c for c in col.chars | set(titles) if not c.isspace()} | set(map(chr, range(32, 127))))
    serif_text = "".join(serif)

    ascii_text = "".join(map(chr, range(32, 127))) + "·—–‘’“”…×°±→←↑↓√%‰€¥"

    icons = set(re.findall(r'<i class="ms[^"]*"[^>]*>([a-z0-9_]+)</i>', html))
    icons |= set(re.findall(r'<span class="ms[^"]*"[^>]*>([a-z0-9_]+)</span>', html))
    for js in (ROOT / "assets" / "js").glob("*.js"):
        icons |= set(re.findall(r'class="ms[^"]*">([a-z0-9_]+)<', js.read_text(encoding="utf-8")))
    icons |= {"check", "graphic_eq"}  # CSS content 里用到的
    icons = sorted(icons)

    sig = hashlib.sha1(json.dumps([serif_text, ascii_text, icons]).encode()).hexdigest()
    stamp = FONTS / ".signature"
    if stamp.exists() and stamp.read_text() == sig and all((FONTS / n).exists() for n in ("noto-serif-sc-900.woff2", "material-symbols-rounded.woff2")):
        print("字体子集无变化，跳过下载")
        return
    print(f"衬线字形 {len(serif)} 个，图标 {len(icons)} 个")
    gfont("Noto+Serif+SC:wght@700", FONTS / "noto-serif-sc-700.woff2", text=serif_text)
    gfont("Noto+Serif+SC:wght@900", FONTS / "noto-serif-sc-900.woff2", text=serif_text)
    gfont("Roboto+Flex:opsz,wdth,wght@8..144,25..151,100..1000", FONTS / "roboto-flex.woff2", text=ascii_text)
    gfont("Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200", FONTS / "material-symbols-rounded.woff2", icons=icons)
    stamp.write_text(sig)


def main() -> None:
    html = assemble()
    print(f"index.html {len(html) / 1024:.1f} KB")
    if "--fonts" in sys.argv:
        fonts(html)


if __name__ == "__main__":
    main()
