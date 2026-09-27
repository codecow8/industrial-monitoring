import json
import os
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_session
from .models import TelemetryObservation
from .repository import get_published


router = APIRouter()
MANUAL = Path(__file__).parents[4] / "fixtures" / "manuals" / "pump-01.md"
WINDOW = timedelta(minutes=15)


class DiagnosisRequest(BaseModel):
    kind: Literal["threshold", "fault"]
    dataKey: str = Field(min_length=1)
    threshold: float | None = None


class Statement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str
    sourceIds: list[str]


class ModelResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    observedFacts: list[Statement]
    possibleCauses: list[Statement]
    recommendedChecks: list[Statement]


def request_model(payload: dict) -> dict:
    provider = os.getenv("AI_PROVIDER", "deepseek").lower()
    if provider == "deepseek":
        api_key = os.getenv("DEEPSEEK_API_KEY")
        endpoint = "https://api.deepseek.com/responses"
        model = os.getenv("AI_MODEL") or "deepseek-flash"
        key_name = "DEEPSEEK_API_KEY"
    elif provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        endpoint = "https://api.openai.com/v1/responses"
        model = os.getenv("AI_MODEL") or os.getenv("OPENAI_DIAGNOSIS_MODEL") or "gpt-6-luna"
        key_name = "OPENAI_API_KEY"
    else:
        raise HTTPException(status_code=503, detail="AI_PROVIDER 仅支持 deepseek 或 openai")
    if not api_key:
        raise HTTPException(status_code=503, detail=f"AI 分析尚未配置：请在后端设置 {key_name}")
    schema = ModelResult.model_json_schema()
    # Structured Outputs requires every object to disallow extra properties.
    schema["additionalProperties"] = False
    schema["$defs"]["Statement"]["additionalProperties"] = False
    format_config = {"type": "json_schema", "name": "alarm_diagnosis", "schema": schema}
    if provider == "openai":
        format_config["strict"] = True
    body = {
        "model": model,
        "instructions": (
            "你是工业监控只读诊断助手。仅根据提供的遥测记录和模拟手册，使用中文输出。"
            "observedFacts 只写遥测观测值或由观测证明的变化，每条都必须至少引用一个 observation 来源；"
            "页面配置可与观测一起引用，但不要把页面配置单独列为 observedFact。"
            "可能原因必须标为待核实，不得把猜测写成事实。"
            "缺少流量、压差或振动观测时不得断言堵塞、流量不足或泵故障。"
            "若没有告警前的正常观测，不得编造触发时间。"
            "只建议现场核对和人工检查，不提供远程启停、切换、设定值修改等设备控制建议。"
            "每条内容必须引用提供的 source ID，不输出数字置信度。"
        ),
        "input": json.dumps(payload, ensure_ascii=False),
        "text": {"format": format_config},
    }
    if provider == "openai":
        body["store"] = False
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
            response.raise_for_status()
        output = response.json()["output"]
        text = next(content["text"] for item in output if item["type"] == "message"
                    for content in item["content"] if content["type"] == "output_text")
        return json.loads(text)
    except (httpx.HTTPError, KeyError, StopIteration, ValueError) as error:
        raise HTTPException(status_code=502, detail="AI 分析服务暂不可用，请稍后重试") from error


def validate_model_result(raw: dict, source_ids: set[str]) -> ModelResult:
    try:
        result = ModelResult.model_validate(raw)
    except ValueError as error:
        raise HTTPException(status_code=502, detail="AI 分析结果格式无效") from error
    for statement in result.observedFacts + result.possibleCauses + result.recommendedChecks:
        if not statement.sourceIds or any(source_id not in source_ids for source_id in statement.sourceIds):
            raise HTTPException(status_code=502, detail="AI 分析引用了无效来源")
        if re.search(r"\d+(?:\.\d+)?\s*%", statement.text):
            raise HTTPException(status_code=502, detail="AI 分析包含未经证据支持的数字置信度")
    observed_facts = []
    for fact in result.observedFacts:
        if any(source_id.startswith("observation:") for source_id in fact.sourceIds):
            observed_facts.append(fact)
    if not observed_facts:
        raise HTTPException(status_code=502, detail="AI 分析缺少遥测观测事实")
    result.observedFacts = observed_facts
    confirmed_terms = ("已确认", "已证实", "已确定", "确定为", "确定是", "确定堵塞", "确认为", "证实了", "必然", "根因是")
    for cause in result.possibleCauses:
        if any(term in cause.text for term in confirmed_terms):
            raise HTTPException(status_code=502, detail="可能原因不能断言已确认根因")
        if "待核实" not in cause.text:
            cause.text = f"待核实：{cause.text}"
    forbidden = ("远程启", "远程停", "启动泵", "停止泵", "关闭阀", "开启阀", "打开阀", "修改设定值", "切换设备", "下发命令")
    if any(any(term in check.text for term in forbidden) for check in result.recommendedChecks):
        raise HTTPException(status_code=502, detail="AI 分析包含不允许的设备控制建议")
    return result


@router.post("/api/pages/{page_key}/alarm-diagnoses")
def diagnose_alarm(
    page_key: str,
    request: DiagnosisRequest,
    session: Session = Depends(get_session),
) -> dict:
    if (request.kind == "threshold") != (request.threshold is not None):
        raise HTTPException(status_code=422, detail="Threshold is required only for threshold alarms")
    published = get_published(session, page_key)
    if published is None:
        raise HTTPException(status_code=404, detail="Published page not found")
    matches = [node for node in published["schema"]["components"] if (
        request.kind == "threshold"
        and node["type"] in ("metric-card", "trend-chart")
        and node["props"]["dataKey"] == request.dataKey
        and node["props"]["alarmThreshold"] == request.threshold
    ) or (
        request.kind == "fault"
        and node["type"] == "device-state"
        and node["props"]["dataKey"] == request.dataKey
    )]
    if not matches:
        raise HTTPException(status_code=404, detail="Alarm condition not found in published page")

    now = datetime.now(UTC)
    effective_at = datetime.fromisoformat(published["publishedAt"])
    start = max(now - WINDOW, effective_at)
    keys = {node["props"]["dataKey"] for node in published["schema"]["components"]
            if node["type"] in ("metric-card", "trend-chart", "device-state")}
    records = session.execute(
        select(TelemetryObservation)
        .where(TelemetryObservation.data_key.in_(keys), TelemetryObservation.received_at >= start,
               TelemetryObservation.received_at <= now)
        .order_by(TelemetryObservation.received_at.desc(), TelemetryObservation.id.desc())
        .limit(1000)
    ).scalars().all()
    observations = [
        {"id": item.id, "dataKey": item.data_key, "value": item.value,
         "sourceTimestamp": item.source_timestamp, "receivedAt": item.received_at.isoformat()}
        for item in reversed(records)
    ]
    selected = [item for item in observations if item["dataKey"] == request.dataKey]
    latest = selected[-1] if selected else None
    active = latest is not None and (
        latest["value"] >= request.threshold if request.kind == "threshold" else latest["value"] == 2
    )
    if not active:
        raise HTTPException(status_code=409, detail="告警已恢复或无近期观测，请刷新运行态")

    condition = {"kind": request.kind, "dataKey": request.dataKey}
    condition["threshold" if request.kind == "threshold" else "stateCode"] = (
        request.threshold if request.kind == "threshold" else 2
    )
    sources = [{**item, "id": f"observation:{item['id']}", "type": "observation"}
               for item in observations]
    sources.append({"id": f"page:{page_key}:v{published['version']}", "type": "page",
                    "title": f"页面配置 v{published['version']}"})
    manual = MANUAL.read_text(encoding="utf-8") if any(
        "冷却泵" in node["props"].get("deviceName", "") for node in matches
    ) else None
    if manual:
        sources.append({"id": "manual:PUMP-01:3.2", "type": "manual", "title": "PUMP-01 §3.2", "excerpt": manual})
    base = {
        "alarm": {"pageId": page_key, "version": published["version"], "condition": condition},
        "sources": sources,
        "dataFreshness": {"windowStart": start.isoformat(), "windowEnd": now.isoformat(),
                          "latestReceivedAt": latest["receivedAt"],
                          "stale": (now - datetime.fromisoformat(latest["receivedAt"])).total_seconds() > 30},
    }
    if len(selected) < 2:
        return {"status": "insufficient_evidence", **base,
                "observedFacts": [{"text": "仅有一条告警观测，无法确认触发时间和变化趋势",
                                   "sourceIds": [f"observation:{latest['id']}"]}],
                "possibleCauses": [], "recommendedChecks": []}

    raw = request_model({"alarm": base["alarm"],
                         "observations": [{**item, "sourceId": f"observation:{item['id']}"} for item in observations],
                         "pageSourceId": f"page:{page_key}:v{published['version']}",
                         "manual": {"sourceId": "manual:PUMP-01:3.2", "text": manual} if manual else None})
    result = validate_model_result(raw, {source["id"] for source in sources})
    return {"status": "completed", **base, **result.model_dump()}
