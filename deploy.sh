#!/bin/bash
set -euo pipefail

APP_DIR="/volume1/docker/inventory-web"
SERVICE="nextjs"
CONTAINER="inventory-web-nextjs"
WAIT_SECONDS=60
WAIT_INTERVAL=5

# 본문 전체를 함수로 감싼다 — git pull 이 이 파일을 바꿔도 이미 읽은 내용으로 끝까지 실행된다.
main() {
  # root 가 아니면 root(HOME=/root)로 다시 실행 — root 의 git 설정(safe.directory)을 쓰기 위함
  if [ "$(id -u)" -ne 0 ]; then
    exec sudo -H bash "$0" "$@"
  fi

  cd "$APP_DIR"

  echo "[1/4] git pull"
  local safe_dirs
  safe_dirs="$(git config --global --get-all safe.directory || true)"
  if ! grep -qxF -- "$APP_DIR" <<< "$safe_dirs"; then
    git config --global --add safe.directory "$APP_DIR"
  fi
  git pull

  echo "[2/4] docker compose build $SERVICE"
  export BUILDX_GIT_INFO=0
  docker compose build "$SERVICE"

  echo "[3/4] docker compose up -d $SERVICE"
  docker compose up -d "$SERVICE"

  echo "[4/4] 컨테이너 실행 확인 ($CONTAINER, 최대 ${WAIT_SECONDS}초)"
  local elapsed=0 running retried=0
  while true; do
    running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)"
    if [ "$running" = "true" ]; then
      break
    fi
    # 첫 확인에서 꺼져 있으면 한 번 더 켠다 (이미지가 그대로일 때 up -d 가 켜지 않은 경우 대비)
    if [ "$retried" -eq 0 ]; then
      retried=1
      echo "컨테이너가 실행 중이 아님 → docker compose up -d $SERVICE 재시도"
      docker compose up -d "$SERVICE"
    fi
    if [ "$elapsed" -ge "$WAIT_SECONDS" ]; then
      docker ps -a --filter "name=$CONTAINER"
      docker logs --tail 30 "$CONTAINER" || true
      echo "배포 실패: 컨테이너가 실행 중이 아님"
      exit 1
    fi
    sleep "$WAIT_INTERVAL"
    elapsed=$((elapsed + WAIT_INTERVAL))
  done

  git log --oneline -1
  docker ps --filter "name=$CONTAINER" --format '{{.Names}}  {{.Status}}'
  echo "배포 완료!"
}

main "$@"
