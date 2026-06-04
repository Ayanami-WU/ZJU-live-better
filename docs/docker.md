# Docker 部署

这个镜像默认运行 `courses.zju/autosign.js`，也可以用同一个镜像运行仓库里的其他脚本。

## 1. 准备 env 文件

```bash
mkdir -p deploy/env data
cp deploy/env/autosign.env.example deploy/env/autosign.env
```

编辑 `deploy/env/autosign.env`，填入真实的 `ZJU_USERNAME` 和 `ZJU_PASSWORD`。真实 env 文件已经被 `.gitignore` 忽略，不要提交。

## 2. 启动默认自动签到

```bash
docker compose up -d --build
docker compose logs -f autosign
```

停止：

```bash
docker compose down
```

## 3. ARM64 或弱网络构建很慢

如果构建日志长时间停在 `[deps 1/4] FROM docker.io/library/node...`，说明 Docker 还在拉取 Node 基础镜像，项目代码尚未开始构建。

默认使用体积较小、支持 ARM64 的 Alpine 镜像。可以先单独拉取基础镜像，再启动：

```bash
docker pull node:22-alpine
docker compose up -d --build
```

如果 Docker 在 ARM64 设备上仍然解析或拉取异常，可以显式指定平台：

```bash
docker pull --platform linux/arm64 node:22-alpine
docker compose up -d --build
```

如果运行环境需要 Debian slim 镜像，可以通过环境变量切换：

```bash
LIVE_BETTER_NODE_IMAGE=node:22-bookworm-slim docker compose up -d --build
```

如果停留在 `node:22-bookworm-slim` 的大层下载上，优先使用默认的 `node:22-alpine`；`bookworm-slim` 在弱网络下更容易表现得像“卡死”。

## 4. 多 env 部署

每个账号或环境用一份独立 env 文件，再用不同的 Compose project name 启动：

```bash
cp deploy/env/autosign.env.example deploy/env/A.env
cp deploy/env/autosign.env.example deploy/env/L.env
```

分别编辑 `deploy/env/A.env` 和 `deploy/env/L.env` 后启动：

```bash
COMPOSE_PROJECT_NAME=live-better-a LIVE_BETTER_ENV_FILE=./deploy/env/A.env docker compose up -d --build
COMPOSE_PROJECT_NAME=live-better-l LIVE_BETTER_ENV_FILE=./deploy/env/L.env docker compose up -d --build
```

查看或停止某个环境时也带上同一组变量：

```bash
COMPOSE_PROJECT_NAME=live-better-a LIVE_BETTER_ENV_FILE=./deploy/env/A.env docker compose logs -f autosign
COMPOSE_PROJECT_NAME=live-better-a LIVE_BETTER_ENV_FILE=./deploy/env/A.env docker compose down
```

## 5. 传脚本参数

临时查看帮助：

```bash
docker compose run --rm autosign --help
```

临时 dry run：

```bash
docker compose run --rm autosign --dry-run
```

如果某个环境需要长期带参数，在对应 env 文件里配置：

```env
LIVE_BETTER_ARGS=--radarAt AUTO
```

多账号 JSON 可以放到 `data/accounts.json`，然后在 env 文件里配置：

```env
LIVE_BETTER_ARGS=--accounts-file /data/accounts.json
```

`docker-compose.yml` 已经把本地 `./data` 挂载到容器 `/data`。

## 6. 运行其他脚本

一次性运行其他脚本：

```bash
docker compose run --rm autosign classroom.zju/generateCourseMd.js
```

或在 env 文件里固定脚本：

```env
LIVE_BETTER_SCRIPT=classroom.zju/generateCourseMd.js
```

课堂下载路径默认是 `/data/downloads`，会落到本地 `./data/downloads`。
