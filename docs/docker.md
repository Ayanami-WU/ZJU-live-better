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

## 3. 多 env 部署

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

## 4. 传脚本参数

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
LIVE_BETTER_ARGS=--raderAt AUTO
```

多账号 JSON 可以放到 `data/accounts.json`，然后在 env 文件里配置：

```env
LIVE_BETTER_ARGS=--accounts-file /data/accounts.json
```

`docker-compose.yml` 已经把本地 `./data` 挂载到容器 `/data`。

## 5. 运行其他脚本

一次性运行其他脚本：

```bash
docker compose run --rm autosign classroom.zju/generateCourseMd.js
```

或在 env 文件里固定脚本：

```env
LIVE_BETTER_SCRIPT=classroom.zju/generateCourseMd.js
```

课堂下载路径默认是 `/data/downloads`，会落到本地 `./data/downloads`。
