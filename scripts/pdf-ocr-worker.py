import argparse
import json
import os
import re
import sys
from pathlib import Path


def fail(message):
    print(json.dumps({"ok": False, "error": message, "pages": []}))
    return 1


def parse_crop_requests(raw_value):
    if not raw_value:
        return []
    try:
        parsed = json.loads(raw_value)
    except Exception as exc:
        raise ValueError(f"Invalid crops JSON: {exc}")
    if not isinstance(parsed, list):
        raise ValueError("Invalid crops JSON: expected a list.")
    return parsed


def finite_number(value):
    try:
        number = float(value)
    except Exception:
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def parse_bbox(value):
    if not isinstance(value, list) or len(value) != 4:
        return None
    numbers = [finite_number(item) for item in value]
    if any(item is None for item in numbers):
        return None
    x0, y0, x1, y1 = numbers
    if x1 <= x0 or y1 <= y0:
        return None
    return x0, y0, x1, y1


def render_crop(doc, crop, out_dir, public_prefix, matrix, index):
    candidate_id = str(crop.get("candidate_id") or f"crop-{index + 1}")
    result = {
        "candidate_id": candidate_id,
        "page_number": crop.get("page_number"),
        "image_url": None,
        "bbox": crop.get("bbox"),
        "warnings": [],
    }
    try:
        page_number = int(crop.get("page_number"))
    except Exception:
        result["warnings"].append("Crop request did not include a valid page number.")
        return result
    result["page_number"] = page_number
    if page_number < 1 or page_number > len(doc):
        result["warnings"].append(f"Crop page {page_number} is outside PDF page range.")
        return result
    bbox = parse_bbox(crop.get("bbox"))
    if not bbox:
        result["warnings"].append("Crop request did not include a valid bbox.")
        return result

    page = doc.load_page(page_number - 1)
    page_rect = page.rect
    x0, y0, x1, y1 = bbox
    padding = finite_number(crop.get("padding"))
    padding = 8 if padding is None else max(0, min(padding, 36))
    rect = page_rect & __import__("fitz").Rect(x0 - padding, y0 - padding, x1 + padding, y1 + padding)
    if rect.is_empty or rect.width < 8 or rect.height < 8:
        result["warnings"].append("Crop bbox is empty or too small after clipping to the page.")
        return result
    page_area = max(1, page_rect.width * page_rect.height)
    crop_area = rect.width * rect.height
    if crop_area > page_area * 0.78:
        result["warnings"].append("Crop bbox is too close to a full page and was not rendered.")
        return result

    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in candidate_id).strip("-") or f"crop-{index + 1}"
    image_name = f"crop-{index + 1:03d}-{safe_id[:48]}.png"
    image_path = out_dir / image_name
    pix = page.get_pixmap(matrix=matrix, clip=rect, alpha=False)
    pix.save(image_path)
    result["image_url"] = f"{public_prefix}/{image_name}"
    result["bbox"] = [round(rect.x0, 2), round(rect.y0, 2), round(rect.x1, 2), round(rect.y1, 2)]
    return result


def choice_label(line):
    match = re.match(r"^\s*(\(?[A-E]\)?[\.\)]?|\u00a9[\.\)]?|1D)\s+(\S.*)$", line, re.IGNORECASE)
    if not match:
        return None
    token = match.group(1).upper()
    if token.startswith("\u00a9"):
        label = "C"
    elif token == "1D":
        label = "D"
    else:
        label = re.sub(r"[^A-E]", "", token)
    return label, match.group(2)


def normalize_choice_lines(rendered_lines):
    normalized = list(rendered_lines)
    recovered = 0
    index = 0
    while index < len(rendered_lines):
        parsed = choice_label(rendered_lines[index])
        if not parsed or parsed[0] != "A":
            index += 1
            continue
        run = []
        expected = "A"
        cursor = index
        while cursor < len(rendered_lines):
            parsed = choice_label(rendered_lines[cursor])
            if not parsed or parsed[0] != expected:
                break
            run.append((cursor, parsed[0], parsed[1]))
            if expected == "E":
                break
            expected = chr(ord(expected) + 1)
            cursor += 1
        if len(run) >= 4:
            for line_index, label, text in run:
                normalized[line_index] = f"{label}. {text}"
            recovered += len(run)
            index = run[-1][0] + 1
            continue
        index += 1
    return normalized, recovered


def normalize_question_lines(rendered_lines):
    normalized = []
    recovered = 0
    for line in rendered_lines:
        match = re.match(
            r"^\s*(\d{1,3})\s+(.+\b(?:question|which|what|why|how|assume|calculate|determine|identify|select|find)\b.*)$",
            line,
            re.IGNORECASE,
        )
        if match:
            normalized.append(f"{match.group(1)}. {match.group(2)}")
            recovered += 1
        else:
            normalized.append(line)
    return normalized, recovered


def main():
    parser = argparse.ArgumentParser(description="Render PDF pages and OCR them with Tesseract.")
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--pages", default="", help="Comma-separated 1-based page numbers.")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--public-prefix", required=True)
    parser.add_argument("--tesseract-cmd", default="")
    parser.add_argument("--dpi", type=int, default=220)
    parser.add_argument("--psm", type=int, choices=[3, 4, 6, 11], default=6)
    parser.add_argument("--render-only", action="store_true")
    parser.add_argument("--crops-json", default="", help="JSON crop requests using PDF page coordinates.")
    args = parser.parse_args()

    try:
        import fitz
    except Exception as exc:
        return fail(f"Missing Python PDF rendering dependency: {exc}")

    if not args.render_only:
        try:
            import pytesseract
            from PIL import Image
        except Exception as exc:
            return fail(f"Missing Python OCR dependency: {exc}")
    else:
        pytesseract = None
        Image = None

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        return fail(f"PDF not found: {pdf_path}")

    if args.tesseract_cmd and pytesseract is not None:
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

    try:
        crop_requests = parse_crop_requests(args.crops_json)
    except ValueError as exc:
        return fail(str(exc))

    if not page_numbers and not crop_requests:
        return fail("No PDF pages or crop requests were provided.")
    if not args.render_only and not page_numbers:
        return fail("OCR mode requires at least one page number.")

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
            if args.render_only:
                page_result["status"] = "not_needed"
                results.append(page_result)
                continue

            image = Image.open(image_path)
            gray = image.convert("L")
            data = pytesseract.image_to_data(gray, lang="eng", config=f"--psm {args.psm}", output_type=pytesseract.Output.DICT)
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
            rendered_lines, recovered_question_starts = normalize_question_lines(rendered_lines)
            rendered_lines, recovered_choice_labels = normalize_choice_lines(rendered_lines)

            page_result["text"] = "\n".join(rendered_lines).strip()
            page_result["confidence"] = round(sum(confidences) / len(confidences), 2) if confidences else None
            page_result["status"] = "completed" if page_result["text"] else "failed"
            if recovered_question_starts:
                page_result["warnings"].append(
                    f"Normalized punctuation for {recovered_question_starts} OCR question start(s). Admin must verify the recovered boundaries."
                )
            if recovered_choice_labels:
                page_result["warnings"].append(
                    f"Normalized {recovered_choice_labels} OCR choice labels from a sequential A-D/E line run. Admin must verify the recovered labels."
                )
            if not page_result["text"]:
                page_result["warnings"].append("Tesseract returned no text for this page.")
        except Exception as exc:
            page_result["warnings"].append(f"OCR failed: {exc}")
        results.append(page_result)

    crop_results = []
    for index, crop in enumerate(crop_requests):
        crop_results.append(render_crop(doc, crop, out_dir, public_prefix, matrix, index))

    print(json.dumps({"ok": True, "pages": results, "crops": crop_results}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
