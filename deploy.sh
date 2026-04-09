#!/bin/bash
cd /volume1/docker/inventory-web
git pull
sudo BUILDX_GIT_INFO=0 docker compose build nextjs
sudo docker compose up -d
echo "배포 완료!"