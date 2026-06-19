import hashlib
import math
import re
from collections import OrderedDict
from typing import Iterable, List


VECTOR_DIMENSION = 256
TOKEN_PATTERN = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]+", re.IGNORECASE)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def extract_terms(text: str) -> List[str]:
    normalized = normalize_text(text)
    ordered_terms: "OrderedDict[str, None]" = OrderedDict()

    for match in TOKEN_PATTERN.finditer(normalized):
        token = match.group(0)
        if not token:
            continue
        ordered_terms[token] = None
        if re.fullmatch(r"[\u4e00-\u9fff]+", token):
            for size in (2, 3, 4):
                if len(token) < size:
                    continue
                for index in range(len(token) - size + 1):
                    ordered_terms[token[index : index + size]] = None

    return list(ordered_terms.keys())


def embed_text(text: str) -> List[float]:
    vector = [0.0] * VECTOR_DIMENSION
    for term in extract_terms(text):
        digest = hashlib.sha256(term.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % VECTOR_DIMENSION
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + min(len(term), 6) * 0.15
        vector[index] += sign * weight

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def embed_texts(texts: Iterable[str]) -> List[List[float]]:
    return [embed_text(text) for text in texts]
