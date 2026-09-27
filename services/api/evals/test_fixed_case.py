from fastapi import HTTPException
import pytest

from industrial_api.diagnosis import validate_model_result


SOURCES = {"observation:101", "observation:102", "observation:103", "page:demo:v1", "manual:PUMP-01:3.2"}


def fixed_case() -> dict:
    return {
        "observedFacts": [
            {"text": "出口温度从 72.0°C 升至 83.0°C，超过页面阈值", "sourceIds": ["observation:101", "observation:103"]},
        ],
        "possibleCauses": [
            {"text": "冷却水流量不足，待核实；当前缺少流量观测", "sourceIds": ["observation:103", "manual:PUMP-01:3.2"]},
        ],
        "recommendedChecks": [
            {"text": "现场核对冷却水流量和过滤器压差", "sourceIds": ["manual:PUMP-01:3.2"]},
        ],
    }


def test_fixed_case_separates_facts_hypotheses_and_read_only_checks() -> None:
    result = validate_model_result(fixed_case(), SOURCES)
    assert result.observedFacts[0].sourceIds == ["observation:101", "observation:103"]
    assert "待核实" in result.possibleCauses[0].text
    assert "核对" in result.recommendedChecks[0].text


def test_unmarked_hypothesis_is_labeled_pending_review() -> None:
    candidate = fixed_case()
    candidate["possibleCauses"][0]["text"] = "流量不足可能导致温度偏高，但缺少流量观测"
    result = validate_model_result(candidate, SOURCES)
    assert result.possibleCauses[0].text.startswith("待核实：")


def test_non_telemetry_content_is_not_presented_as_observed_fact() -> None:
    candidate = fixed_case()
    candidate["observedFacts"].insert(0, {
        "text": "页面配置的告警阈值为 80°C", "sourceIds": ["page:demo:v1"],
    })
    candidate["observedFacts"].insert(0, {
        "text": "手册建议核对过滤器", "sourceIds": ["manual:PUMP-01:3.2"],
    })
    result = validate_model_result(candidate, SOURCES)
    assert [fact.text for fact in result.observedFacts] == ["出口温度从 72.0°C 升至 83.0°C，超过页面阈值"]


def test_page_configuration_alone_cannot_make_a_completed_analysis() -> None:
    candidate = fixed_case()
    candidate["observedFacts"] = [{"text": "页面阈值为 80°C", "sourceIds": ["page:demo:v1"]}]
    with pytest.raises(HTTPException) as error:
        validate_model_result(candidate, SOURCES)
    assert error.value.status_code == 502


@pytest.mark.parametrize("section,statement", [
    ("observedFacts", {"text": "温度 90°C", "sourceIds": ["observation:999"]}),
    ("possibleCauses", {"text": "过滤器确定堵塞", "sourceIds": ["manual:PUMP-01:3.2"]}),
    ("possibleCauses", {"text": "待核实：已确认过滤器堵塞", "sourceIds": ["manual:PUMP-01:3.2"]}),
    ("possibleCauses", {"text": "过滤器有 85% 概率堵塞，待核实", "sourceIds": ["manual:PUMP-01:3.2"]}),
    ("recommendedChecks", {"text": "远程启动泵", "sourceIds": ["manual:PUMP-01:3.2"]}),
])
def test_fixed_case_rejects_unsubstantiated_or_control_output(section: str, statement: dict) -> None:
    candidate = fixed_case()
    candidate[section] = [statement]
    with pytest.raises(HTTPException) as error:
        validate_model_result(candidate, SOURCES)
    assert error.value.status_code == 502
