import argparse
import json
import os
import sys
from pathlib import Path


def fail(message):
    print(json.dumps({"ok": False, "error": message, "pages": []}))
    return 1


def main():
    parser = argparse.ArgumentParser(description="Render PDF pages and OCR them with Tesseract.")
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--pages", required=True, help="Comma-separated 1-based page numbers.")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--public-prefix", required=True)
    parser.add_argument("--tesseract-cmd", default="")
    parser.add_argument("--dpi", type=int, default=220)
    args = parser.parse_args()

    try:
        import fitz
        import pytesseract
        from PIL import Image
    except Exception as exc:
        return fail(f"Missing Python OCR dependency: {exc}")

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        return fail(f"PDF not found: {pdf_path}")

    if args.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = args.tesseract_cmd

    page_numbers = []
    for raw in args.pages.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            page_numbers.append(int(raw))
        except ValueError:
            return fail(f"Invalid page number: {raw}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    public_prefix = args.public_prefix.rstrip("/")
    results = []

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        return fail(f"Unable to open PDF: {exc}")

    zoom = args.dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    for page_number in page_numbers:
        page_result = {
            "page_number": page_number,
            "status": "failed",
            "text": "",
            "confidence": None,
            "image_url": None,
            "warnings": [],
        }
        try:
            if page_number < 1 or page_number > len(doc):
                page_result["warnings"].append(f"Page {page_number} is outside PDF page range.")
                results.append(page_result)
                continue

            page = doc.load_page(page_number - 1)
            image_path = out_dir / f"page-{page_number:03d}.png"
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            pix.save(image_path)
            page_result["image_url"] = f"{public_prefix}/page-{page_number:03d}.png"

            image = Image.open(image_path)
            gray = image.convert("L")
            data = pytesseract.image_to_data(gray, lang="eng", config="--psm 6", output_type=pytesseract.Output.DICT)
            lines = {}
            confidences = []
            texts = data.get("text", [])
            confs = data.get("conf", [])
            blocks = data.get("block_num", [])
            pars = data.get("par_num", [])
            line_nums = data.get("line_num", [])
            word_nums = data.get("word_num", [])
            for index, (text, conf) in enumerate(zip(texts, confs)):
                text = (text or "").strip()
                if text:
                    key = (
                        blocks[index] if index < len(blocks) else 0,
                        pars[index] if index < len(pars) else 0,
                        line_nums[index] if index < len(line_nums) else 0,
                    )
                    word_number = word_nums[index] if index < len(word_nums) else index
                    lines.setdefault(key, []).append((word_number, text))
                try:
                    confidence = float(conf)
                except Exception:
                    confidence = -1
                if confidence >= 0:
                    confidences.append(confidence)

            rendered_lines = []
            for key in sorted(lines.keys()):
                rendered_lines.append(" ".join(text for _, text in sorted(lines[key], key=lambda item: item[0])))

            page_result["text"] = "\n".join(rendered_lines).strip()
            page_result["confidence"] = round(sum(confidences) / len(confidences), 2) if confidences else None
            page_result["status"] = "completed" if page_result["text"] else "failed"
            if not page_result["text"]:
                page_result["warnings"].append("Tesseract returned no text for this page.")
        except Exception as exc:
            page_result["warnings"].append(f"OCR failed: {exc}")
        results.append(page_result)

    print(json.dumps({"ok": True, "pages": results}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
