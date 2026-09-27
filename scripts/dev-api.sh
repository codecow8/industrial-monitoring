#!/usr/bin/env bash
set -e

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
provider="${AI_PROVIDER:-deepseek}"
export AI_PROVIDER="$provider"

case "$provider" in
  deepseek)
    if [[ -z "${DEEPSEEK_API_KEY:-}" ]] && command -v security >/dev/null 2>&1; then
      if saved_key="$(security find-generic-password -a "$(id -un)" -s industrial-monitoring-deepseek -w 2>/dev/null)"; then
        export DEEPSEEK_API_KEY="$saved_key"
      fi
    fi
    if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
      echo "提示：未找到 DEEPSEEK_API_KEY；其他 API 可用，智能分析需先配置 DeepSeek 密钥。" >&2
    fi
    ;;
  openai)
    if [[ -z "${OPENAI_API_KEY:-}" ]] && command -v security >/dev/null 2>&1; then
      if saved_key="$(security find-generic-password -a "$(id -un)" -s industrial-monitoring-openai -w 2>/dev/null)"; then
        export OPENAI_API_KEY="$saved_key"
      fi
    fi
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
      echo "提示：未找到 OPENAI_API_KEY；其他 API 可用，智能分析需先配置 OpenAI 密钥。" >&2
    fi
    ;;
  *)
    echo "AI_PROVIDER 仅支持 deepseek 或 openai" >&2
    exit 2
    ;;
esac

cd "$project_root/services/api"
exec uv run --python 3.12 uvicorn industrial_api.main:app --reload --host 127.0.0.1 --port 8000
