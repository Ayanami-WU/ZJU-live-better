# `autosign.js` 转发版聊天稿

下面这段可以直接复制给第一次用这个脚本的人。

```text
`autosign.js` 的最简单用法如下，按顺序做就行：

1. 先装 Git 和 Node.js。
Git 下载： https://git-scm.com/download/win
Node.js 下载： https://nodejs.org/
Node 建议装 LTS，18+ 就行。装完后重新打开 PowerShell。

2. 打开 PowerShell，把项目下载下来：
cd D:\
mkdir code
cd .\code
这个项目拉代码时要走 gh 代理，不要直接用 github.com：
git clone https://ghfast.top/https://github.com/5dbwat4/ZJU-live-better.git
cd .\ZJU-live-better

3. 安装依赖：
npm install

4. 配学号和密码：
notepad .env
把里面改成：
ZJU_USERNAME=
ZJU_PASSWORD=

5. 地点不是必填：
这个脚本本来就是自动轮询用的，现在默认可以直接自动尝试全部已知点位，所以大多数人不用每节课手动选地点，也不用先改代码。

如果你想让它先优先尝试某个教学区，再继续轮询其他点位，也可以额外传 `--raderAt`。

可用代号：
ZJGD1 = 东一教学楼
ZJGX1 = 西教学楼
ZJGB1 = 段永平教学楼
YQ4 = 玉泉教四
YQ1 = 玉泉教一
YQ7 = 玉泉教七
ZJ1 = 之江校区1
HJC1 = 华家池校区1
HJC2 = 华家池校区2
ZJ2 = 之江校区2
YQSS = 玉泉宿舍点位
ZJG4 = 紫金港大西区

6. 启动脚本：
node courses.zju/autosign.js

如果你想优先试玉泉教一，也可以这样：
node courses.zju/autosign.js --raderAt YQ1

如果你想明确指定全自动轮询全部已知点位，也可以这样：
node courses.zju/autosign.js --raderAt AUTO

7. 看到 `[Auto Sign-in](Req #1) No rollcalls found.` 这种输出，说明脚本已经正常跑起来了，只是当前没有签到。
如果看到 `Found ... rollcalls`、`Now answering rollcall`、`Number Rollcall ... succeeded` 这些字样，说明它正在处理签到。

8. 这个窗口不要关，脚本会一直运行。
想停掉就按 `Ctrl + C`。

9. 如果 `node` 或 `git` 提示找不到命令，就重装对应软件，然后重新打开 PowerShell。
如果脚本跑不起来，先检查 `.env` 里的学号密码；`raderAt` 不是必填，只是可选优化。
```
