"""Render the approved Vaishnavi SVG pages to one A4 PDF.

This is deliberately client-specific and is not used by any other tenant.
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter


DEFAULT_SOURCE = Path(
    r"C:\Users\aadi\Downloads\DOC-20260813-WA0014-1,DOC-20260813-WA0014-2"
)
DEFAULT_OUTPUT = Path(r"C:\Users\aadi\Downloads\vaishnavi_svg_design_proof.pdf")
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def render_page(svg: Path, output: Path, work: Path) -> None:
    html = work / f"{svg.stem}.html"
    html.write_text(
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>@page{size:A4;margin:0}html,body{margin:0;width:210mm;height:297mm;"
        "overflow:hidden}img{display:block;width:210mm;height:297mm}</style>"
        f"</head><body><img src='{svg.as_uri()}'></body></html>",
        encoding="utf-8",
    )
    subprocess.run(
        [
            str(CHROME),
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={output}",
            html.as_uri(),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    if not output.exists() or output.stat().st_size < 1000:
        raise RuntimeError(f"Chrome did not render {svg}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not CHROME.exists():
        raise FileNotFoundError(CHROME)
    pages = [
        args.source_dir / "DOC-20260813-WA0014-1.svg",
        args.source_dir / "DOC-20260813-WA0014-2.svg",
    ]
    for page in pages:
        text = page.read_text(encoding="utf-8")
        if 'viewBox="0 0 594.95999 841.92"' not in text:
            raise ValueError(f"Unexpected Vaishnavi page geometry: {page}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vaishnavi-svg-") as temp:
        work = Path(temp)
        rendered = []
        for index, page in enumerate(pages, start=1):
            target = work / f"page-{index}.pdf"
            render_page(page.resolve(), target, work)
            rendered.append(target)

        writer = PdfWriter()
        for rendered_page in rendered:
            reader = PdfReader(rendered_page)
            if len(reader.pages) != 1:
                raise RuntimeError(f"Expected one page from {rendered_page}")
            writer.add_page(reader.pages[0])
        with args.output.open("wb") as stream:
            writer.write(stream)

    final = PdfReader(args.output)
    if len(final.pages) != 2:
        raise RuntimeError("Vaishnavi output must contain exactly two pages")
    print(args.output)


if __name__ == "__main__":
    main()
