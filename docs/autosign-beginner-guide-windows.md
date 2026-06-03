# `autosign.js` 小白使用教程（Windows 版）

这份教程只讲怎么用，不讲原理。你跟着做完后，可以完成这几件事：

- 装好 `Git` 和 `Node.js`
- 把项目下载到自己电脑
- 配好学号和密码
- 把签到地点改成自己常用的教学区
- 启动 `autosign.js`
- 看懂脚本是不是在正常运行
- 需要停掉时知道怎么停

整个过程都在 Windows 的 PowerShell 里完成。

## 1. 先准备环境

你电脑里要先有这两个东西：

- `Git`
- `Node.js`

### 安装 Git

1. 打开 Git 官网下载页：`https://git-scm.com/download/win`
2. 下载 Windows 安装包。
3. 一路点下一步安装即可。
4. 安装完以后，先关闭所有 PowerShell 窗口，再重新打开一个新的 PowerShell。

### 安装 Node.js

1. 打开 Node.js 官网：`https://nodejs.org/`
2. 下载 `LTS` 版本。
3. 安装时保持默认选项即可。
4. 安装完以后，再重新打开一个新的 PowerShell。

建议使用 `Node.js 18+`。

### 检查有没有装好

在 PowerShell 里分别输入下面三条命令：

```powershell
git --version
node -v
npm -v
```

如果三条命令都能正常显示版本号，就可以继续。

## 2. 用 Git 下载项目

因为网络原因，这个项目拉取代码时请直接使用 `https://ghfast.top/` 作为 GitHub 代理，不要直接克隆原始 GitHub 地址。

先决定你想把项目放在哪个文件夹。下面用 `D:\code` 举例，你也可以换成自己的路径。

```powershell
cd D:\
mkdir code
cd .\code
git clone https://ghfast.top/https://github.com/5dbwat4/ZJU-live-better.git
cd .\ZJU-live-better
```

执行完后，你现在所在的位置应该就是项目根目录。这个目录里能看到 `package.json`、`README.md`、`courses.zju` 这些内容。

以后每次重新打开 PowerShell，想再次运行脚本时，都要先 `cd` 回这个项目目录。

如果你之前已经用原始 GitHub 地址克隆失败过，不用删别的东西，重新执行上面这条带 `ghfast.top` 的 `git clone` 就行。

## 3. 安装依赖

在项目根目录执行：

```powershell
npm install
```

第一次安装可能要等几分钟，这很正常。只要命令最终顺利结束，没有停在报错状态，就可以继续。

## 4. 配置学号和密码

脚本会从项目根目录读取 `.env` 文件，所以这一步一定要在项目根目录里完成。

先打开 `.env`：

```powershell
notepad .env
```

把里面和账号有关的内容改成你自己的：

```env
ZJU_USERNAME=
ZJU_PASSWORD=
```

注意这几点：

- 如果打开后文件里本来就有内容，直接把学号和密码改成你自己的即可。
- 这两行里不要加中文引号，也不要在等号前后乱加空格。
- 文件名必须叫 `.env`，不要变成 `.env.txt`。
- `.env` 要放在项目根目录，也就是和 `package.json` 同一级的位置。

改完以后按 `Ctrl + S` 保存，然后关闭记事本。

## 5. 地点设置不是必填

这里需要特别说明一下：`autosign.js` 本身就是自动轮询脚本。

对雷达签到来说，它不是“每节课都要你自己选一个地点再签到”。它会在检测到签到后自动尝试点位。现在这套用法里，默认就可以走“自动轮询全部已知点位”的方式，所以你完全可以先不改地点，直接用。

也就是说，最省事的用法是：

- 配好学号和密码
- 直接启动脚本
- 让它自己轮询和处理签到

如果你只是想先用起来，这一节可以直接跳过。

### 可选：设置一个“优先尝试”的地点

如果你希望脚本先优先尝试某个教学区，再继续尝试其他已知点位，可以额外指定一个 `raderAt`。这不是必填项，只是一个可选优化。

当前脚本里已有的地点代号如下：

| 代号 | 地点 |
| --- | --- |
| `ZJGD1` | 东一教学楼 |
| `ZJGX1` | 西教学楼 |
| `ZJGB1` | 段永平教学楼 |
| `YQ4` | 玉泉教四 |
| `YQ1` | 玉泉教一 |
| `YQ7` | 玉泉教七 |
| `ZJ1` | 之江校区 1 |
| `HJC1` | 华家池校区 1 |
| `HJC2` | 华家池校区 2 |
| `ZJ2` | 之江校区 2 |
| `YQSS` | 玉泉宿舍点位 |
| `ZJG4` | 紫金港大西区 |

怎么选最简单：

- 你平时大多数课在哪个区域，就先填哪个区域。
- 如果你最近大多数课都在某一栋教学楼附近，就优先填那一项。
- 如果你懒得配，或者上课地点经常变，那就直接用默认的全自动模式。

现在更推荐用运行命令时传参，而不是手改文件。例如你想让它优先尝试玉泉教一，可以这样启动：

```powershell
node courses.zju/autosign.js --raderAt YQ1
```

如果你想完全交给脚本自动轮询全部已知点位，可以显式写成：

```powershell
node courses.zju/autosign.js --raderAt AUTO
```

## 6. 启动脚本

确认你现在还在项目根目录，然后执行：

```powershell
node courses.zju/autosign.js
```

这条命令现在默认就可以按“自动轮询全部已知点位”的方式运行，所以大多数人直接用这一条就够了。

启动后注意这几件事：

- 这个窗口不要关。
- 这个脚本会一直运行，不会自己退出。
- 你如果把电脑睡眠了，脚本也会跟着停掉。
- 以后每次要重新使用，都要先进入项目目录，再运行这条命令。

## 7. 怎么判断有没有正常运行

这个脚本默认是一直轮询检查，所以只要它持续输出信息，而且没有直接报错退出，通常就说明在正常工作。

最常见的正常输出是：

```text
[Auto Sign-in](Req #1) No rollcalls found.
```

这句话的意思是：

- 脚本已经在跑了
- 这一次检查没有发现新的签到

它会持续输出类似的内容，这很正常。

如果发现了签到，可能会看到类似下面这些提示：

```text
[Auto Sign-in](Req #12) Found 1 rollcalls.
[Auto Sign-in] Now answering rollcall #171329
[Auto Sign-in] Detected active rollcall #171329: ...
```

你可以这样理解：

- `Found 1 rollcalls.`：发现有签到了
- `Now answering rollcall #...`：脚本已经开始处理这次签到
- `Detected active rollcall #...`：确认找到一个正在进行中的签到

如果是雷达签到，成功时可能会看到类似：

```text
[Auto Sign-in] Trying configured Rader location: YQ1 with outcome: ...
```

或者：

```text
[Auto Sign-in] Congradulations! You are on the call at Rader location: YQ1
```

如果是数字签到，成功时可能会看到：

```text
[Auto Sign-in] Number Rollcall 171329 succeeded: found code 0123.
```

如果你看到的是下面这种报错：

```text
[Auto Sign-in](Req #1) Failed to fetch rollcalls:
```

一般说明这次访问课程平台没有成功。先不要慌，优先检查下面几件事：

- 当前网络是否正常
- 学号和密码有没有填错
- 你是不是没有在项目根目录运行脚本

还有一个容易误会的点：

- 默认不开钉钉通知时，终端里不一定会出现“登录成功”字样。
- 只要脚本已经开始循环输出 `No rollcalls found.`，就说明它已经正常跑起来了。

## 8. 怎么停止

如果你想停掉脚本，在当前这个 PowerShell 窗口里按：

```text
Ctrl + C
```

按完以后，脚本就会停止。

## 9. 常见问题

### 1. 输入 `node -v` 提示找不到命令

说明 `Node.js` 没装好，或者装完后没有重新打开 PowerShell。

你可以这样处理：

- 重新安装一次 `Node.js`
- 安装完成后关闭 PowerShell，再开一个新的窗口
- 再执行一次 `node -v`

### 2. 输入 `git --version` 提示找不到命令

说明 `Git` 没装好，或者装完后没有重新打开 PowerShell。

处理方法和上面一样：

- 重新安装 `Git`
- 安装完成后关闭 PowerShell，再开一个新的窗口
- 再执行一次 `git --version`

### 3. `npm install` 失败了

先做这几件事：

- 检查网络
- 确认你真的在项目根目录
- 直接再执行一次 `npm install`

### 4. 明明改了 `.env`，脚本还是不对

重点检查：

- `.env` 文件是不是放在项目根目录
- 文件名是不是 `.env`
- 学号和密码是不是你自己的
- 有没有把密码输错

项目根目录就是能看到 `package.json` 的那个目录。

### 5. 脚本一直在跑，但签到效果不好

先确认你现在用的是哪种模式：

- 如果你是直接运行 `node courses.zju/autosign.js`，那它现在默认就是自动轮询全部已知点位。
- 如果你想让它先优先试某个教学区，可以改成 `node courses.zju/autosign.js --raderAt YQ1` 这种写法。

也就是说，`raderAt` 现在不是必填项，而是一个可选优化项。

### 6. 我下一次怎么快速启动

下次用的时候，最短流程就是：

```powershell
cd 你的项目目录
node courses.zju/autosign.js
```

前提是你之前已经做过这三件事：

- 装好了 `Git`
- 装好了 `Node.js`
- 在项目里跑过一次 `npm install`

## 10. 最后再提醒一次

真正最容易漏掉的只有三件事：

- `.env` 里要填你自己的学号和密码
- 默认可以直接全自动跑；`raderAt` 只是可选优化，不是必改项
- 启动后终端窗口不要关，停止时按 `Ctrl + C`

如果你只是想要一份更短、能直接转发给别人的版本，可以看同目录下的 `autosign-chat-message.md`。
