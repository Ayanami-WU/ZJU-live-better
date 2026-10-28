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


## 7. 运行成绩监控

在对应的 env 文件中配置：

```env
LIVE_BETTER_SCRIPT=zdbk.zju/gradeMonitor.js
LIVE_BETTER_ARGS=monitor
GRADE_STATE_PATH=/data/grades.json
```

然后使用同样的 `docker compose up -d --build` 启动。成绩基线保存在本地 `./data/grades.json`，容器重建后仍会保留。不同账号或实例应分别指定状态文件路径，避免共用基线。

只检查一次成绩：

```bash
docker compose run --rm -e LIVE_BETTER_SCRIPT=zdbk.zju/gradeMonitor.js -e LIVE_BETTER_ARGS=check -e GRADE_STATE_PATH=/data/grades.json autosign
```

数字签到现在只发送提醒，不再自动尝试数字码，以免耗尽服务器允许的尝试次数；多用户运行和空轮询心跳保持可用。


## 统一配置文件

采用与 CC98 容器项目类似的 `users` 数组布局；其中账号应填写浙大统一身份认证账号。完整示例在仓库根目录 `config.json.example`：

```json
{
  "users": [
    { "label": "自己", "username": "your_zju_username", "password": "your_zju_password" },
    { "label": "另一个账号", "username": "another_username", "password": "another_password", "radarAt": "AUTO" }
  ],
  "autosign": { "radarAt": "AUTO", "pollIntervalMs": 4000, "heartbeatEvery": 100 },
  "dingtalk": { "enabled": false, "webhook": "", "secret": "" },
  "gradeMonitor": { "statePath": "/data/grades.json" },
  "classroom": { "downloadPath": "/data/downloads" }
}
```

- `pollIntervalMs` 单位为毫秒，必须是正整数；默认 4000。
- `heartbeatEvery` 表示每个账号连续空轮询时每隔多少次发送心跳；默认 100，设为 0 可关闭。
- `autosign.radarAt` 是账号的默认地点，账号自己的 `radarAt` 优先；命令行 `--radarAt` 可覆盖所有选中账号。
- `dingtalk` 适用于所有账号及成绩通知；`gradeMonitor` 还支持 `startHour`、`endHour`、`intervalSeconds`、`requestTimeoutMs`、`notifyInitial`、`checkEvaluation`。
- 普通单账号脚本使用第一个 `users` 账号作为默认值；运行时环境变量和所选 `.env` 中的值优先于 JSON 对应设置。多用户自动签到使用完整 `users` 数组。
- `--accounts-file` 优先选用旧账号文件；`--prompt` 或显式用户名/密码参数可替代统一文件中的账号选择。
- 文件路径选择顺序：`--config`、`LIVE_BETTER_CONFIG_FILE`、源码根目录 `config.json`。容器入口发现 `/data/config.json` 时也会自动加载；显式指定的文件缺失或格式错误会直接报错。
- `--env` / `ENV_FILE`、单账号环境变量和旧账号 JSON 均继续兼容。JSON 不实现 CC98 项目的 `webvpn` 代理配置。

本地源码示例中的 `gradeMonitor.statePath` 和 `classroom.downloadPath` 可改成相对路径，例如 `state/grades.json`、`downloads`。真实配置被 Git 和 Docker 构建上下文排除，凭据不进入镜像。

## 从 GHCR 部署

使用仓库中的 `compose.ghcr.yaml` 和 `config.json.example`，在部署目录执行：

```bash
mkdir -p data
# 仅首次创建时复制，已有配置请保留。
test -e data/config.json || cp config.json.example data/config.json
# 编辑 data/config.json 后，在 Linux 上让容器的 node 用户可读写该目录。
# 下列命令适用于新建的专用 data 目录；按部署环境选择是否需要 sudo。
sudo chown -R 1000:1000 data
sudo chmod 700 data
sudo chmod 600 data/config.json

docker compose -f compose.ghcr.yaml pull
docker compose -f compose.ghcr.yaml up -d
docker compose -f compose.ghcr.yaml logs -f
```

也可直接运行：

```bash
docker run -d --name zju-live-better --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -v "$PWD/data:/data" \
  ghcr.io/ayanami-wu/zju-live-better:feat-dockerized
```

首次上线前可检查解析出的账号和地点，不发登录或签到请求：

```bash
docker compose -f compose.ghcr.yaml run --rm autosign --dry-run
```

切换为成绩监控：

```bash
LIVE_BETTER_SCRIPT=zdbk.zju/gradeMonitor.js LIVE_BETTER_ARGS=monitor \
  docker compose -f compose.ghcr.yaml up -d
```

镜像发布工作流只在 `feat/dockerized`、`v*` 标签或手动触发时运行。分支镜像标签为 `feat-dockerized` 和 `dockerized`，另有 `sha-<提交短 SHA>`；不发布 `latest`。固定 SHA 标签或 digest 可避免后续分支更新改变部署版本。发布任务先执行测试，再构建 amd64/arm64，最后对两个架构执行禁用网络的帮助和 dry-run 检查。

更新使用同样的 `pull`、`up -d` 命令，`./data` 中的配置和状态持续保留。镜像公开后可匿名拉取；若 GHCR 包仍为私有，请先在 GitHub 包设置中改为公开，或使用有 `read:packages` 权限的凭据执行 `docker login ghcr.io`。
