from pathlib import Path
import os

from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv
from openai import OpenAI

from er_parser import build_chen_model, generate_mermaid_chen, generate_mermaid_er, parse_mysql_schema

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

load_dotenv(BASE_DIR / ".env")

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIST_DIR / "assets"),
    static_url_path="/assets",
)


def get_chat_client() -> OpenAI:
    api_key = (
        os.getenv("DASHSCOPE_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or ""
    ).strip()
    if not api_key:
        raise RuntimeError("未配置 DASHSCOPE_API_KEY（或 OPENAI_API_KEY）")

    return OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def index(path: str):
    if path.startswith("api/"):
        return jsonify({"error": "Not Found"}), 404

    if not FRONTEND_DIST_DIR.exists():
        return (
            "前端尚未构建。请先执行：cd frontend && npm install && npm run build，"
            "或开发模式运行 npm run dev 访问 http://127.0.0.1:5900",
            503,
        )

    if path:
        file_path = FRONTEND_DIST_DIR / path
        if file_path.exists() and file_path.is_file():
            return send_from_directory(str(FRONTEND_DIST_DIR), path)

    return send_from_directory(str(FRONTEND_DIST_DIR), "index.html")


@app.post("/api/generate")
def generate() -> tuple:
    payload = request.get_json(silent=True) or {}
    sql = (payload.get("sql") or "").strip()

    if not sql:
        return jsonify({"error": "SQL 不能为空"}), 400

    try:
        tables, warnings = parse_mysql_schema(sql)
        if not tables:
            return jsonify({"error": "没有识别到 CREATE TABLE 语句，请输入 MySQL 建表 SQL。"}), 400

        mermaid_crow = generate_mermaid_er(tables)
        mermaid_chen = generate_mermaid_chen(tables)
        chen_model = build_chen_model(tables)
        return jsonify({
            "mermaid": mermaid_crow,
            "mermaidCrow": mermaid_crow,
            "mermaidChen": mermaid_chen,
            "chenModel": chen_model,
            "tableCount": len(tables),
            "warnings": warnings,
        }), 200
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": f"解析失败: {exc}"}), 400


@app.post("/api/chat")
def chat() -> tuple:
    payload = request.get_json(silent=True) or {}
    incoming_messages = payload.get("messages")
    model = str(payload.get("model") or "deepseek-v3.2").strip() or "deepseek-v3.2"
    enable_thinking = bool(payload.get("enableThinking", True))

    if not isinstance(incoming_messages, list) or not incoming_messages:
        return jsonify({"error": "messages 不能为空"}), 400

    normalized_messages = []
    for item in incoming_messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "").strip()
        if role not in {"system", "user", "assistant"} or not content:
            continue
        normalized_messages.append({
            "role": role,
            "content": content,
        })

    if not normalized_messages:
        return jsonify({"error": "messages 格式无效"}), 400

    try:
        client = get_chat_client()
        completion = client.chat.completions.create(
            model=model,
            messages=normalized_messages,
            extra_body={"enable_thinking": enable_thinking},
            stream=False,
        )

        choices = getattr(completion, "choices", None) or []
        if not choices:
            return jsonify({"error": "模型未返回内容"}), 502

        message = getattr(choices[0], "message", None)
        reply = getattr(message, "content", "") if message else ""
        reasoning = getattr(message, "reasoning_content", "") if message else ""

        if isinstance(reply, list):
            normalized_reply = []
            for part in reply:
                if isinstance(part, dict):
                    normalized_reply.append(str(part.get("text", "")))
                elif hasattr(part, "text"):
                    normalized_reply.append(str(getattr(part, "text", "")))
                else:
                    normalized_reply.append(str(part))
            reply = "".join(normalized_reply)

        if isinstance(reasoning, list):
            reasoning = "".join(str(item) for item in reasoning)

        usage_raw = getattr(completion, "usage", None)
        usage = usage_raw.model_dump() if hasattr(usage_raw, "model_dump") else usage_raw

        return jsonify({
            "reply": str(reply or "").strip(),
            "reasoning": str(reasoning or "").strip(),
            "model": model,
            "usage": usage,
        }), 200
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": f"客服请求失败: {exc}"}), 502


if __name__ == "__main__":
    app.run(debug=True)
