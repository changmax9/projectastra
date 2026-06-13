import argparse
import json
import os
import re
import sys
from collections import deque
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


def rounded_pdf_bbox(pixel_bbox, image_width, image_height, page_width, page_height):
    x0, y0, x1, y1 = pixel_bbox
    return [
        round(x0 * page_width / image_width, 2),
        round(y0 * page_height / image_height, 2),
        round(x1 * page_width / image_width, 2),
        round(y1 * page_height / image_height, 2),
    ]


def connected_regions(mask):
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    regions = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if visited[offset] or pixels[x, y] == 0:
                continue
            queue = deque([(x, y)])
            visited[offset] = 1
            x0 = x1 = x
            y0 = y1 = y
            pixel_count = 0
            while queue:
                current_x, current_y = queue.popleft()
                pixel_count += 1
                x0 = min(x0, current_x)
                y0 = min(y0, current_y)
                x1 = max(x1, current_x)
                y1 = max(y1, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                        continue
                    next_offset = next_y * width + next_x
                    if visited[next_offset] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_offset] = 1
                    queue.append((next_x, next_y))
            regions.append((x0, y0, x1 + 1, y1 + 1, pixel_count))
    return regions


def scanned_visual_blocks(gray, word_boxes, page_width, page_height):
    from PIL import ImageDraw, ImageFilter

    image_width, image_height = gray.size
    scale = min(1.0, 720 / max(1, image_width))
    reduced_width = max(1, round(image_width * scale))
    reduced_height = max(1, round(image_height * scale))
    reduced = gray.resize((reduced_width, reduced_height))
    ink = reduced.point(lambda value: 255 if value < 185 else 0)
    draw = ImageDraw.Draw(ink)
    for left, top, right, bottom in word_boxes:
        padding = max(2, round(5 * scale))
        draw.rectangle(
            (
                max(0, round(left * scale) - padding),
                max(0, round(top * scale) - padding),
                min(reduced_width, round(right * scale) + padding),
                min(reduced_height, round(bottom * scale) + padding),
            ),
            fill=0,
        )

    merged = ink.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MaxFilter(9))
    page_area = reduced_width * reduced_height
    blocks = []
    for region_index, (x0, y0, x1, y1, pixel_count) in enumerate(connected_regions(merged)):
        width = x1 - x0
        height = y1 - y0
        area_ratio = width * height / max(1, page_area)
        if width < reduced_width * 0.06 or height < reduced_height * 0.025:
            continue
        if area_ratio < 0.002 or area_ratio > 0.48:
            continue
        if y0 > reduced_height * 0.80:
            continue
        density = pixel_count / max(1, width * height)
        if density < 0.015:
            continue
        pixel_bbox = (
            x0 / scale,
            y0 / scale,
            x1 / scale,
            y1 / scale,
        )
        blocks.append(
            {
                "bbox": rounded_pdf_bbox(pixel_bbox, image_width, image_height, page_width, page_height),
                "text": "",
                "block_number": None,
                "source": "tesseract-nontext-region",
                "kind": "image",
                "visual_type": "diagram",
                "visual_index": region_index,
                "ink_density": round(density, 4),
                "page_width": round(page_width, 2),
                "page_height": round(page_height, 2),
            }
        )
    return sorted(blocks, key=lambda block: (block["bbox"][1], block["bbox"][0]))[:12]


def bbox_overlap_ratio(left, right):
    intersection_width = max(0, min(left[2], right[2]) - max(left[0], right[0]))
    intersection_height = max(0, min(left[3], right[3]) - max(left[1], right[1]))
    intersection = intersection_width * intersection_height
    left_area = max(1, (left[2] - left[0]) * (left[3] - left[1]))
    return intersection / left_area


def main():
    parser = argparse.ArgumentParser(description="Render PDF pages and OCR them with Tesseract.")
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--pages", default="", help="Comma-separated 1-based page numbers.")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--public-prefix", required=True)
    parser.add_argument("--tesseract-cmd", default="")
    parser.add_argument("--dpi", type=int, default=220)
    parser.add_argument("--psm", type=int, choices=[3, 4, 6, 11], default=3)
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
            "raw_text": "",
            "raw_blocks": [],
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
            line_boxes = {}
            line_confidences = {}
            word_boxes = []
            confidences = []
            texts = data.get("text", [])
            confs = data.get("conf", [])
            blocks = data.get("block_num", [])
            pars = data.get("par_num", [])
            line_nums = data.get("line_num", [])
            word_nums = data.get("word_num", [])
            lefts = data.get("left", [])
            tops = data.get("top", [])
            widths = data.get("width", [])
            heights = data.get("height", [])
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
                    left = int(lefts[index]) if index < len(lefts) else 0
                    top = int(tops[index]) if index < len(tops) else 0
                    width = int(widths[index]) if index < len(widths) else 0
                    height = int(heights[index]) if index < len(heights) else 0
                    word_bbox = (left, top, left + width, top + height)
                    word_boxes.append(word_bbox)
                    previous = line_boxes.get(key)
                    line_boxes[key] = word_bbox if previous is None else (
                        min(previous[0], word_bbox[0]),
                        min(previous[1], word_bbox[1]),
                        max(previous[2], word_bbox[2]),
                        max(previous[3], word_bbox[3]),
                    )
                try:
                    confidence = float(conf)
                except Exception:
                    confidence = -1
                if confidence >= 0:
                    confidences.append(confidence)
                    if text:
                        line_confidences.setdefault(key, []).append(confidence)

            line_records = []
            raw_blocks = []
            for key in sorted(lines.keys()):
                line_text = " ".join(text for _, text in sorted(lines[key], key=lambda item: item[0]))
                line_bbox = line_boxes.get(key)
                if line_bbox:
                    pdf_bbox = rounded_pdf_bbox(line_bbox, image.width, image.height, float(page.rect.width), float(page.rect.height))
                    line_confidence_values = line_confidences.get(key, [])
                    line_confidence = (
                        round(sum(line_confidence_values) / len(line_confidence_values), 2)
                        if line_confidence_values
                        else None
                    )
                    line_records.append({"text": line_text, "bbox": pdf_bbox, "confidence": line_confidence})
                    raw_blocks.append(
                        {
                            "bbox": pdf_bbox,
                            "text": line_text,
                            "block_number": int(key[0]) if key else None,
                            "source": "tesseract-line",
                            "kind": "text",
                            "confidence": line_confidence,
                            "page_width": round(float(page.rect.width), 2),
                            "page_height": round(float(page.rect.height), 2),
                        }
                    )
            visual_blocks = scanned_visual_blocks(gray, word_boxes, float(page.rect.width), float(page.rect.height))
            page_result["raw_blocks"] = [*raw_blocks, *visual_blocks]
            page_result["raw_text"] = "\n".join(record["text"] for record in line_records).strip()
            if visual_blocks:
                page_result["warnings"].append(
                    f"Detected {len(visual_blocks)} bounded non-text visual region(s) from the scanned page for review-only crop proposals."
                )
            removed_visual_noise_lines = 0
            rendered_lines = []
            for record in line_records:
                overlaps_visual = any(
                    bbox_overlap_ratio(record["bbox"], visual_block["bbox"]) >= 0.6
                    for visual_block in visual_blocks
                )
                compact_text = re.sub(r"\W+", "", record["text"])
                looks_like_visual_fragment = len(compact_text) <= 4 and not re.search(r"[.!?]", record["text"])
                if overlaps_visual and (
                    (record["confidence"] is not None and record["confidence"] < 55) or looks_like_visual_fragment
                ):
                    removed_visual_noise_lines += 1
                    continue
                rendered_lines.append(record["text"])
            if removed_visual_noise_lines:
                page_result["warnings"].append(
                    f"Excluded {removed_visual_noise_lines} low-confidence OCR line(s) inside detected visual regions from normalized segmentation text; raw OCR remains available for audit."
                )
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
