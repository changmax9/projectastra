import argparse
import json
import sys
from pathlib import Path


def fail(message):
    print(json.dumps({"ok": False, "error": message, "pages": []}))
    return 1


def clean_text(value):
    lines = []
    for raw_line in (value or "").replace("\r", "\n").split("\n"):
        line = " ".join(raw_line.split())
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def is_noise_block(text, bbox, page_height):
    normalized = " ".join(text.split()).strip()
    upper = normalized.upper()
    y0 = bbox[1]
    y1 = bbox[3]
    if not normalized:
        return True
    if normalized.isdigit() and y0 > page_height * 0.88:
        return True
    if y0 > page_height * 0.86 and (
        "UNAUTHORIZED COPYING" in upper
        or "GO ON TO THE NEXT PAGE" in upper
        or upper == "STOP"
    ):
        return True
    return False


def likely_two_columns(blocks, page_width):
    narrow_blocks = []
    for block in blocks:
        x0, _, x1, _ = block["bbox"]
        width = x1 - x0
        if width < page_width * 0.58:
            narrow_blocks.append(block)
    left = 0
    right = 0
    for block in narrow_blocks:
        x0, _, x1, _ = block["bbox"]
        center = (x0 + x1) / 2
        if center < page_width * 0.48:
            left += 1
        elif center > page_width * 0.52:
            right += 1
    return left >= 2 and right >= 2


def sort_blocks(blocks, page_width, page_height):
    two_columns = likely_two_columns(blocks, page_width)

    def key(block):
        x0, y0, x1, _ = block["bbox"]
        width = x1 - x0
        center = (x0 + x1) / 2
        if not two_columns:
            return (0, y0, x0)
        is_full_width = width > page_width * 0.62 or (x0 < page_width * 0.18 and x1 > page_width * 0.82)
        if is_full_width and y0 < page_height * 0.18:
            return (0, y0, x0)
        if is_full_width and y0 > page_height * 0.82:
            return (3, y0, x0)
        column = 0 if center < page_width / 2 else 1
        return (1, column, y0, x0)

    ordered = sorted(blocks, key=key)
    for block in ordered:
        x0, _, x1, _ = block["bbox"]
        center = (x0 + x1) / 2
        block["column"] = 0 if center < page_width / 2 else 1
        block["reading_order"] = ordered.index(block)
        if two_columns:
            block["layout"] = "two-column"
        else:
            block["layout"] = "single-column"
    return ordered


def main():
    parser = argparse.ArgumentParser(description="Extract PDF text in geometry-aware page reading order.")
    parser.add_argument("--pdf", required=True)
    args = parser.parse_args()

    try:
        import fitz
    except Exception as exc:
        return fail(f"Missing PyMuPDF dependency: {exc}")

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        return fail(f"PDF not found: {pdf_path}")

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        return fail(f"Unable to open PDF: {exc}")

    pages = []
    for page_index in range(len(doc)):
        page = doc.load_page(page_index)
        page_width = float(page.rect.width)
        page_height = float(page.rect.height)
        raw_blocks = []
        try:
            for item in page.get_text("blocks", sort=False):
                if len(item) < 7:
                    continue
                x0, y0, x1, y1, text, block_number, block_type = item[:7]
                if block_type != 0:
                    continue
                cleaned = clean_text(text)
                bbox = [round(float(x0), 2), round(float(y0), 2), round(float(x1), 2), round(float(y1), 2)]
                if is_noise_block(cleaned, bbox, page_height):
                    continue
                raw_blocks.append(
                    {
                        "bbox": bbox,
                        "text": cleaned,
                        "block_number": int(block_number),
                        "source": "pymupdf",
                    }
                )
            ordered_blocks = sort_blocks(raw_blocks, page_width, page_height)
            page_text = "\n".join(block["text"] for block in ordered_blocks).strip()
            pages.append(
                {
                    "page_number": page_index + 1,
                    "text": page_text,
                    "raw_blocks": ordered_blocks,
                    "warnings": [],
                }
            )
        except Exception as exc:
            pages.append(
                {
                    "page_number": page_index + 1,
                    "text": "",
                    "raw_blocks": [],
                    "warnings": [f"Structured text extraction failed: {exc}"],
                }
            )

    print(json.dumps({"ok": True, "page_count": len(doc), "pages": pages}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
