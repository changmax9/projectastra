import argparse
import json
import re
import sys
from pathlib import Path


QUESTION_STEM_RE = re.compile(r"^(?:Question\s+)?\d{1,3}[\).]\s+", re.IGNORECASE)
CHOICE_BLOCK_RE = re.compile(r"^\(A\)\s+", re.IGNORECASE)


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


def rounded_bbox(rect):
    values = (rect.x0, rect.y0, rect.x1, rect.y1) if hasattr(rect, "x0") else rect[:4]
    return [
        round(float(values[0]), 2),
        round(float(values[1]), 2),
        round(float(values[2]), 2),
        round(float(values[3]), 2),
    ]


def bbox_area(bbox):
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def bbox_intersection_area(left, right):
    width = max(0, min(left[2], right[2]) - max(left[0], right[0]))
    height = max(0, min(left[3], right[3]) - max(left[1], right[1]))
    return width * height


def bboxes_touch(left, right, tolerance=0.5):
    return (
        left[0] <= right[2] + tolerance
        and left[2] + tolerance >= right[0]
        and left[1] <= right[3] + tolerance
        and left[3] + tolerance >= right[1]
    )


def bbox_overlap_ratio(left, right):
    intersection = bbox_intersection_area(left, right)
    smaller_area = min(bbox_area(left), bbox_area(right))
    return intersection / smaller_area if smaller_area else 0


def usable_visual_bbox(bbox, page_width, page_height):
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    area_ratio = bbox_area(bbox) / max(1, page_width * page_height)
    return width >= 24 and height >= 24 and 0.001 <= area_ratio <= 0.72


def dedupe_visual_blocks(blocks):
    kept = []
    for block in sorted(blocks, key=lambda item: (item["kind"] != "table", -bbox_area(item["bbox"]))):
        duplicate = next(
            (
                existing
                for existing in kept
                if bbox_overlap_ratio(block["bbox"], existing["bbox"]) >= 0.86
            ),
            None,
        )
        if duplicate is None:
            kept.append(block)
    return kept


def visual_blocks_for_page(page, page_width, page_height):
    blocks = []
    page_dimensions = {
        "page_width": round(page_width, 2),
        "page_height": round(page_height, 2),
    }
    try:
        drawings = page.get_drawings()
        for cluster_index, rect in enumerate(page.cluster_drawings()):
            bbox = rounded_bbox(rect)
            if not usable_visual_bbox(bbox, page_width, page_height):
                continue
            related = [
                drawing
                for drawing in drawings
                if bboxes_touch(bbox, rounded_bbox(drawing["rect"]))
            ]
            item_count = sum(len(drawing.get("items", [])) for drawing in related)
            if len(related) < 2 and item_count < 4:
                continue
            vertical_lines = sum(
                1
                for drawing in related
                if drawing["rect"].height >= 12 and drawing["rect"].width <= 2
            )
            horizontal_lines = sum(
                1
                for drawing in related
                if drawing["rect"].width >= 12 and drawing["rect"].height <= 2
            )
            looks_like_table = vertical_lines >= 2 and horizontal_lines >= 2
            blocks.append(
                {
                    "bbox": bbox,
                    "text": "",
                    "block_number": None,
                    "source": "pymupdf-drawings-table" if looks_like_table else "pymupdf-drawings",
                    "kind": "table" if looks_like_table else "vector",
                    "visual_type": "table" if looks_like_table else "diagram",
                    "visual_index": cluster_index,
                    "drawing_count": len(related),
                    "drawing_item_count": item_count,
                    "vertical_line_count": vertical_lines,
                    "horizontal_line_count": horizontal_lines,
                    **page_dimensions,
                }
            )
    except Exception:
        pass

    return dedupe_visual_blocks(blocks)


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


def is_question_stem(block):
    return bool(QUESTION_STEM_RE.match(block.get("text", "")))


def is_choice_block(block):
    return bool(CHOICE_BLOCK_RE.match(block.get("text", "")))


def matching_question_stem(choice_block, question_stems):
    choice_x0, choice_y0, choice_x1, choice_y1 = choice_block["bbox"]
    choice_width = max(choice_x1 - choice_x0, 1)
    matches = []
    for stem in question_stems:
        stem_x0, stem_y0, stem_x1, stem_y1 = stem["bbox"]
        stem_width = max(stem_x1 - stem_x0, 1)
        horizontal_overlap = min(choice_x1, stem_x1) - max(choice_x0, stem_x0)
        if horizontal_overlap < min(choice_width, stem_width) * 0.25:
            continue
        vertical_overlap = min(choice_y1, stem_y1) - max(choice_y0, stem_y0)
        if vertical_overlap < 0:
            continue
        matches.append((abs(choice_x0 - stem_x0), abs(choice_y0 - stem_y0), stem))
    if not matches:
        return None
    return min(matches, key=lambda item: item[:2])[2]


def sort_blocks(blocks, page_width, page_height):
    text_blocks = [block for block in blocks if block.get("kind") == "text"]
    two_columns = likely_two_columns(text_blocks, page_width)
    question_stems = [block for block in text_blocks if is_question_stem(block)]
    choice_parent = {}
    for block in text_blocks:
        if not is_choice_block(block):
            continue
        parent = matching_question_stem(block, question_stems)
        if parent is not None:
            choice_parent[id(block)] = parent

    def key(block):
        x0, y0, x1, _ = block["bbox"]
        width = x1 - x0
        if not two_columns:
            return (0, y0, x0)
        is_full_width = (
            id(block) not in choice_parent
            and (width > page_width * 0.62 or (x0 < page_width * 0.18 and x1 > page_width * 0.82))
        )
        if is_full_width and y0 < page_height * 0.18:
            return (0, y0, x0)
        if is_full_width and y0 > page_height * 0.82:
            return (3, y0, x0)
        column = 0 if x0 < page_width / 2 else 1
        return (1, column, y0, x0)

    child_blocks = set(choice_parent)
    ordered = []
    for block in sorted((block for block in blocks if id(block) not in child_blocks), key=key):
        ordered.append(block)
        children = [child for child in blocks if choice_parent.get(id(child)) is block]
        ordered.extend(sorted(children, key=lambda child: (child["bbox"][1], child["bbox"][0])))

    ordered_text_blocks = [block for block in ordered if block.get("kind") == "text"]
    text_order = {id(block): index for index, block in enumerate(ordered_text_blocks)}
    for block_order, block in enumerate(ordered):
        x0, _, x1, _ = block["bbox"]
        center = (x0 + x1) / 2
        block["column"] = 0 if center < page_width / 2 else 1
        block["reading_order"] = text_order.get(id(block))
        block["block_order"] = block_order
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
        warnings = []
        try:
            for item in page.get_text("blocks", sort=False):
                if len(item) < 7:
                    continue
                x0, y0, x1, y1, text, block_number, block_type = item[:7]
                bbox = [round(float(x0), 2), round(float(y0), 2), round(float(x1), 2), round(float(y1), 2)]
                if block_type != 0:
                    if block_type == 1:
                        raw_blocks.append(
                            {
                                "bbox": bbox,
                                "text": "",
                                "block_number": int(block_number),
                                "source": "pymupdf",
                                "kind": "image",
                                "page_width": round(page_width, 2),
                                "page_height": round(page_height, 2),
                            }
                        )
                    continue
                cleaned = clean_text(text)
                if is_noise_block(cleaned, bbox, page_height):
                    continue
                raw_blocks.append(
                    {
                        "bbox": bbox,
                        "text": cleaned,
                        "block_number": int(block_number),
                        "source": "pymupdf",
                        "kind": "text",
                        "page_width": round(page_width, 2),
                        "page_height": round(page_height, 2),
                    }
                )
        except Exception as exc:
            warnings.append(f"Structured text extraction failed: {exc}")
        raw_blocks.extend(visual_blocks_for_page(page, page_width, page_height))
        ordered_blocks = sort_blocks(raw_blocks, page_width, page_height)
        page_text = "\n".join(block["text"] for block in ordered_blocks if block.get("text")).strip()
        pages.append(
            {
                "page_number": page_index + 1,
                "text": page_text,
                "raw_blocks": ordered_blocks,
                "warnings": warnings,
            }
        )

    print(json.dumps({"ok": True, "page_count": len(doc), "pages": pages}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
