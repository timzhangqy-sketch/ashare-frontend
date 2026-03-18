#!/bin/bash
# A股量化系统前端一键部署脚本
set -e

echo "=== 1. Building frontend ==="
npm run build

echo "=== 2. Deploying to server ==="
scp -r dist/* root@43.139.107.97:/var/www/ashare-ui/

echo "=== 3. Committing to GitHub ==="
git add -A
git commit -m "${1:-deploy frontend}"
git push origin HEAD:main

echo "=== Done! ==="
