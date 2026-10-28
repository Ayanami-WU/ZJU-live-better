# ZJU-live-better

A collection of useful scripts helping you live better in ZJU.

## 配置

创建文件`.env`，配置你的学号和密码

运行`npm install`安装依赖

如果你要使用 `courses.zju/reliableTodolist.js` 里的 Pintia 待办抓取，需要先在浏览器登录 Pintia，然后从 DevTools 中复制请求的 `Cookie` 头，配置到 `.env` 的 `PINTIA_COOKIE`。

使用时，在working dir下运行`node path/to/script`，其中`path/to/script`是指向脚本的路径，例如`classroom.zju/generateCourseMd`

也可以运行`npm link`将本项目链接到全局，然后可以直接在任意目录下运行`zlb`进入脚本选择

## 功能列表

### 学在浙大相关（`courses.zju/`）

| 功能 | 说明 |
| --- | --- |
| `todolist` | 生成作业待办事项列表 |
| `materialDown` | 下载课程所有素材 |
| `materialMaintainer` | 可以基于配置文件增量下载课程素材 |

* \* 部分脚本未列出 \* *

### 智云课堂相关（`classroom.zju/`）

| 功能 | 说明 |
| --- | --- |
| ☆`generateCourseMd` | 将智云课堂语音识别&PPT图片生成Markdown文件 |
| `getVideoURL` | 获取指定课程视频链接 |

### 图书馆相关（`lib.zju/`）

| 功能 | 说明 |
| --- | --- |
| ☆`bookList` | 查询已借阅图书并操作续借 |

### zdbk 相关（`zdbk.zju/`）

| 功能 | 说明 |
| --- | --- |
| `gradeMonitor check` | 检查一次正式课程成绩并记录变化 |
| `gradeMonitor monitor` | 定时监控正式成绩，变化时发送钉钉通知（具体使用细节查看脚本开头注释） |

## 统一配置

可以沿用 `users` 数组的 JSON 配置结构，将浙大账号、钉钉通知、轮询和心跳设置集中到一个文件：

```bash
cp config.json.example config.json
node courses.zju/autosign.js --config ./config.json --dry-run
node courses.zju/autosign.js --config ./config.json
```

请填写浙大统一身份认证账号。配置格式示例和优先级见 [Docker 与统一配置说明](docs/docker.md#统一配置文件)。现有 `.env`、`--env`、`--accounts-file` 和交互输入继续可用。

## Docker

直接使用 GHCR 镜像部署，无需在服务器上构建：

```bash
mkdir -p data
cp config.json.example data/config.json
# 编辑 data/config.json 填入账号；Linux 上还需确保目录可由容器的 UID 1000 读写。
docker compose -f compose.ghcr.yaml pull
docker compose -f compose.ghcr.yaml up -d
```

镜像为 `ghcr.io/ayanami-wu/zju-live-better:feat-dockerized`，支持 `linux/amd64` 和 `linux/arm64`。`compose.ghcr.yaml` 只拉取镜像；下面的原有 Compose 命令仍用于本地源码构建。

也可以用 Docker / Docker Compose 部署：

```bash
cp deploy/env/autosign.env.example deploy/env/autosign.env
docker compose up -d --build
```

ARM64 或弱网络设备如果在拉取 `node:22-bookworm-slim` 时长时间卡住，当前 Docker 配置默认改用更小的 `node:22-alpine`。也可以先执行 `docker pull node:22-alpine`，再重新 `docker compose up -d --build`。

更多用法见 [Docker 部署文档](docs/docker.md)。

## 反馈

反馈使用问题可以添加QQ群：1042563780

## 免责声明

本项目仅供学习交流使用，请勿用于任何商业用途，请勿用于任何非法或违规用途。使用本项目前请务必了解并遵守浙江大学相关政策和规定。作者不对因使用本项目而导致的任何后果负责。

## Star History

<a href="https://www.star-history.com/?repos=5dbwat4%2FZJU-live-better&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=5dbwat4/ZJU-live-better&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=5dbwat4/ZJU-live-better&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=5dbwat4/ZJU-live-better&type=date&legend=top-left" />
 </picture>
</a>
