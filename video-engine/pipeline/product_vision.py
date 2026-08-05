import re
from pathlib import Path

import google.generativeai as genai

from config import GEMINI_API_KEY, GEMINI_MODEL

genai.configure(api_key=GEMINI_API_KEY)

PROMPT = """이 이미지는 중국 샤오홍슈(小红书) 쇼핑 콘텐츠에서 캡처한 장면이야.
화면에 등장하는 상품이 무엇인지 파악해서, 쿠팡에서 검색했을 때 유사 상품을 찾기 좋은
간결한 한국어 검색어(상품명+핵심 특징, 5~10자 내외)만 출력해줘.
예: "여름 쿨매트", "무선 목선풍기", "휴대용 미니 가습기"
상품을 특정할 수 없으면 "알 수 없음"이라고만 출력해줘. 다른 설명은 절대 추가하지 마."""


def guess_product_name(frame_path: Path) -> str:
    image_bytes = Path(frame_path).read_bytes()
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content([
        PROMPT,
        {"mime_type": "image/jpeg", "data": image_bytes},
    ])
    text = (response.text or "").strip()
    text = re.sub(r"^```[a-z]*\n?|```$", "", text, flags=re.MULTILINE).strip()
    text = text.strip("\"'“”‘’ \n")
    return text
