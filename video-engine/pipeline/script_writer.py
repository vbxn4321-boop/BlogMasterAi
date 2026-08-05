import re

import google.generativeai as genai

from config import GEMINI_API_KEY, GEMINI_MODEL

genai.configure(api_key=GEMINI_API_KEY)

PROMPT_TEMPLATE = """너는 쿠팡 파트너스 쇼핑 쇼츠 전문 카피라이터야.
아래 상품 정보를 바탕으로 유튜브 쇼츠(세로 영상)에서 성우가 그대로 낭독할 한국어 판매 대본을 작성해줘.

[상품명]
{product_name}

[강조 포인트]
{emphasis_text}

[작성 규칙]
- 시청자의 시선을 끄는 후킹 문장으로 시작할 것
- 상품명과 강조 포인트를 자연스럽게 녹여낼 것
- 낭독 시간 15~25초 분량(띄어쓰기 포함 약 110~170자)으로 작성할 것
- 마지막은 구매를 유도하는 짧은 문장으로 마무리할 것
- 대본 텍스트만 출력하고, 제목/따옴표/마크다운/이모지/괄호 설명은 절대 넣지 말 것
- 문장은 짧고 구어체로, 성우가 자연스럽게 읽을 수 있게 작성할 것
"""


def _clean(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```[a-z]*\n?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    text = text.strip("\"'“”‘’ \n")
    return text


def write_shorts_script(product_name: str, emphasis_text: str) -> str:
    model = genai.GenerativeModel(GEMINI_MODEL)
    prompt = PROMPT_TEMPLATE.format(product_name=product_name, emphasis_text=emphasis_text)
    response = model.generate_content(prompt)
    return _clean(response.text)


XHS_REWRITE_PROMPT_TEMPLATE = """너는 중국 샤오홍슈(小红书) 쇼핑 콘텐츠를 한국 쿠팡 파트너스용 유튜브 쇼츠 대본으로
재구성하는 번역가 겸 카피라이터야. 아래 원문을 참고해서 상품의 핵심 셀링포인트를 파악한 뒤,
직역이 아니라 완전히 자연스러운 한국어 판매 대본으로 재구성해줘.

[원본 캡션(중국어/한국어 혼재 가능)]
{caption_text}

[원본 음성 인식 텍스트(있을 경우, 중국어일 수 있음)]
{stt_text}

[작성 규칙]
- 낭독 시간 15~25초 분량(띄어쓰기 포함 약 110~170자)으로 작성할 것
- 시청자의 시선을 끄는 후킹 문장으로 시작하고, 구매를 유도하는 문장으로 마무리할 것
- 대본 텍스트만 출력하고, 제목/따옴표/마크다운/이모지/괄호 설명은 절대 넣지 말 것
"""


def rewrite_xhs_script(caption_text: str, stt_text: str) -> str:
    model = genai.GenerativeModel(GEMINI_MODEL)
    prompt = XHS_REWRITE_PROMPT_TEMPLATE.format(
        caption_text=caption_text or "(없음)",
        stt_text=stt_text or "(없음)",
    )
    response = model.generate_content(prompt)
    return _clean(response.text)
