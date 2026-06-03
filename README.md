# ZJU-live-better

A collection of useful scripts helping you live better in ZJU.

## 配置

创建`.env`文件，配置你的学号和密码

运行`npm install`安装依赖

使用时，在working dir下运行`node path/to/script`，其中`path/to/script`是指向脚本的路径，例如`courses.zju/autosign`

## Docker

也可以用 Docker / Docker Compose 部署：

```bash
cp deploy/env/autosign.env.example deploy/env/autosign.env
docker compose up -d --build
```

更多用法见 [Docker 部署文档](docs/docker.md)。

## 反馈

反馈使用问题可以添加QQ群：10425637
