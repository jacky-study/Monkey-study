#!/usr/bin/env bash
# repo-study-status.sh — 查询当前目录研究状态
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
META_FILE="$PROJECT_DIR/.study-meta.json"

# 默认参数
JSON_OUTPUT=false
CHECK_REMOTE=false

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --json) JSON_OUTPUT=true ;;
    --check-remote) CHECK_REMOTE=true ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
  shift
done

# 检测函数
check_dir_name() {
  basename "$PROJECT_DIR" | grep -qE -- '-study$' && echo "yes" || echo "no"
}

check_meta() {
  [[ -f "$META_FILE" ]] && echo "yes" || echo "no"
}

get_origin() {
  if [[ -f "$META_FILE" ]]; then
    local skill created
    skill=$(jq -r '.managedBy.skill // ""' "$META_FILE")
    created=$(jq -r '.managedBy.createdBySkill // false' "$META_FILE")
    if [[ "$skill" == "repo-study" && "$created" == "true" ]]; then
      echo "repo-study-managed"
    else
      echo "non-repo-study"
    fi
  else
    echo "no-meta"
  fi
}

check_remote_version() {
  if [[ ! -f "$META_FILE" ]]; then
    echo '{"status":"unknown","reason":"no meta file"}'
    return
  fi

  local owner repo branch local_sha
  owner=$(jq -r '.repo.owner // ""' "$META_FILE")
  repo=$(jq -r '.repo.name // ""' "$META_FILE")
  branch=$(jq -r '.repo.branch // "main"' "$META_FILE")
  local_sha=$(jq -r '.repo.commitSha // ""' "$META_FILE")

  if [[ -z "$owner" || -z "$repo" ]]; then
    echo '{"status":"unknown","reason":"missing repo info"}'
    return
  fi

  local remote_sha
  remote_sha=$(git ls-remote --heads "https://github.com/${owner}/${repo}.git" "refs/heads/${branch}" 2>/dev/null | awk '{print $1}')

  if [[ -z "$remote_sha" ]]; then
    echo "{\"status\":\"unknown\",\"localCommitSha\":\"${local_sha}\",\"reason\":\"cannot fetch remote\"}"
    return
  fi

  if [[ "$local_sha" == "$remote_sha" ]]; then
    echo "{\"status\":\"up_to_date\",\"localCommitSha\":\"${local_sha}\",\"remoteCommitSha\":\"${remote_sha}\"}"
  else
    echo "{\"status\":\"outdated\",\"localCommitSha\":\"${local_sha}\",\"remoteCommitSha\":\"${remote_sha}\",\"updateRecommended\":true}"
  fi
}

get_topics() {
  if [[ -f "$META_FILE" ]]; then
    jq -c '.topics // []' "$META_FILE")
  else
    echo '[]'
  fi
}

# 主逻辑
dir_name=$(check_dir_name)
has_meta=$(check_meta)
origin=$(get_origin)

remote_result="{}"
if [[ "$CHECK_REMOTE" == true ]]; then
  remote_result=$(check_remote_version)
fi

topics=$(get_topics)
topic_count=$(echo "$topics" | jq 'length')

if [[ "$JSON_OUTPUT" == true ]]; then
  jq -n \
    --arg dir "$PROJECT_DIR" \
    --argjson nameEnd "$dir_name" \
    --argjson hasMeta "$has_meta" \
    --arg origin "$origin" \
    --argjson created "$([[ "$origin" == "repo-study-managed" ]] && echo true || echo false)" \
    --argjson remote "$remote_result" \
    --argjson topics "$topics" \
    --argjson topicCount "$topic_count" \
    '{
      currentDir: $dir,
      checks: { nameEndsWithStudy: $nameEnd, hasStudyMeta: $hasMeta },
      projectOrigin: $origin,
      createdByRepoStudy: $created,
      remoteCheck: $remote,
      topics: $topics,
      summary: { topicCount: $topicCount }
    }'
else
  echo "Repo Study Status"
  echo "Current Directory: $PROJECT_DIR"
  echo "Directory Suffix (*-study): $dir_name"
  echo "Study Meta (.study-meta.json): $has_meta"
  echo "Project Origin: $origin"
  echo "Created By repo-study: $([[ "$origin" == "repo-study-managed" ]] && echo yes || echo no)"

  if [[ "$CHECK_REMOTE" == true ]]; then
    local status local_sha remote_sha
    status=$(echo "$remote_result" | jq -r '.status')
    local_sha=$(echo "$remote_result" | jq -r '.localCommitSha // "unknown"')
    remote_sha=$(echo "$remote_result" | jq -r '.remoteCommitSha // "unknown"')
    echo "Remote Check: $status"
    echo "Local Commit: $local_sha"
    echo "Remote Commit: $remote_sha"

    if [[ "$status" == "outdated" ]]; then
      echo ""
      echo "Update Prompt:"
      echo "检测到远程仓库有更新，是否更新源码？"
      echo "1. 是，更新到最新版本（推荐）"
      echo "2. 否，继续使用当前版本研究"
    fi
  fi

  echo ""
  echo "Topics: $topic_count"
  echo "$topics" | jq -r '.[] | "\(.name) [\(.category)]\n   progress: questions=\(.progress.questionCount) notes=\(.progress.noteCount) guides=\(.progress.guideCount) skill_templates=\(.progress.skillTemplateCount) runnable_skills=\(.progress.runnableSkillCount)\n   packaging: \(.skillPackaging.hasSkillTemplate // false | if true then "template" else "none" end)"' 2>/dev/null || true
fi
