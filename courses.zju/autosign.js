import { v4 as uuidv4 } from "uuid";
import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import "../shared/config.js";
import dingTalk from "../shared/dingtalk-webhook.js";

const CONFIG = {
  raderAt: "ZJGD1",
  coldDownTime: 2500,
};

const AUTO_RADER = "AUTO";

const RaderInfo = {
  ZJGD1: [120.089136, 30.302331], // 东一教学楼
  ZJGX1: [120.085042, 30.30173], // 西教学楼
  ZJGB1: [120.077135, 30.305142], // 段永平教学楼
  YQ4: [120.122176, 30.261555], // 玉泉教四
  YQ1: [120.123853, 30.262544], // 玉泉教一
  YQ7: [120.120344, 30.263907], // 玉泉教七
  ZJ1: [120.126008, 30.192908], // 之江校区1
  HJC1: [120.195939, 30.272068], // 华家池校区1
  HJC2: [120.198193, 30.270419], // 华家池校区2
  ZJ2: [120.124267, 30.19139], // 之江校区2
  YQSS: [120.124001, 30.265735], // 玉泉宿舍点位
  ZJG4: [120.073427, 30.299757], // 紫金港大西区
};

const LOCATION_LABELS = {
  AUTO: "自动轮询全部已知点位",
  ZJGD1: "东一教学楼",
  ZJGX1: "西教学楼",
  ZJGB1: "段永平教学楼",
  YQ4: "玉泉教四",
  YQ1: "玉泉教一",
  YQ7: "玉泉教七",
  ZJ1: "之江校区 1",
  HJC1: "华家池校区 1",
  HJC2: "华家池校区 2",
  ZJ2: "之江校区 2",
  YQSS: "玉泉宿舍点位",
  ZJG4: "紫金港大西区",
};

const LOCATION_CHOICES = [
  {
    name: `${AUTO_RADER} - ${LOCATION_LABELS[AUTO_RADER]}（推荐）`,
    value: AUTO_RADER,
  },
  ...Object.keys(RaderInfo).map((code) => ({
    name: `${code} - ${LOCATION_LABELS[code] ?? code}`,
    value: code,
  })),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stringifyArgs(args) {
  return args
    .map((arg) => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

function parseCliArgs(argv) {
  const parsed = {
    help: false,
    prompt: false,
    dryRun: false,
    username: "",
    password: "",
    label: "",
    raderAt: "",
    accountsFile: "",
    envFile: "",
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const nextValue = () => {
      if (index + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return argv[index];
    };

    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--prompt":
      case "--interactive":
        parsed.prompt = true;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--username":
      case "-u":
        parsed.username = nextValue();
        break;
      case "--password":
      case "-p":
        parsed.password = nextValue();
        break;
      case "--label":
        parsed.label = nextValue();
        break;
      case "--raderAt":
      case "--rader-at":
      case "--location":
        parsed.raderAt = nextValue();
        break;
      case "--accounts-file":
      case "--users-file":
        parsed.accountsFile = nextValue();
        break;
      case "--env":
        parsed.envFile = nextValue();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node courses.zju/autosign.js
  node courses.zju/autosign.js --username 12345678 --password your_password --raderAt AUTO
  node courses.zju/autosign.js --prompt
  node courses.zju/autosign.js --accounts-file ./autosign-users.json

Options:
  --username, -u       Override ZJU_USERNAME for a single user
  --password, -p       Override ZJU_PASSWORD for a single user
  --label              Optional display name used in logs
  --raderAt            Preferred location code, or AUTO to scan all known points
  --prompt             Manually enter one or more accounts in the terminal
  --accounts-file      Read multiple users from a JSON file
  --dry-run            Print resolved account config and exit
  --env                Use a custom env file (already supported by shared/config.js)
  --help, -h           Show this help message

Accounts file example:
[
  {
    "label": "小明",
    "username": "2020123456",
    "password": "password1",
    "raderAt": "AUTO"
  },
  {
    "label": "室友",
    "username": "2021123456",
    "password": "password2",
    "raderAt": "ZJGD1"
  }
]

Tips:
  1. --password 会留在 shell 历史里，平时更建议用 --prompt。
  2. 不传参数时，脚本仍然会回退到 .env 里的 ZJU_USERNAME 和 ZJU_PASSWORD。
  3. raderAt 现在是可选优化项；用 AUTO 时会自动轮询全部已知点位。
`);
}

function resolveAccountsFilePath(filePath) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(process.cwd(), filePath);
}

function normalizeAccount(rawAccount, defaults = {}) {
  if (!rawAccount || typeof rawAccount !== "object") {
    throw new Error("Account config must be an object.");
  }

  const usernameValue = rawAccount.username ?? rawAccount.ZJU_USERNAME ?? defaults.username ?? "";
  const passwordValue = rawAccount.password ?? rawAccount.ZJU_PASSWORD ?? defaults.password ?? "";
  const labelValue = rawAccount.label ?? rawAccount.name ?? defaults.label ?? "";
  const raderAtValue =
    rawAccount.raderAt ??
    rawAccount.rader_at ??
    rawAccount.location ??
    defaults.raderAt ??
    CONFIG.raderAt;

  const username = String(usernameValue).trim();
  const password = String(passwordValue);
  const label = String(labelValue).trim();
  const normalizedRaderAtInput = String(raderAtValue).trim().toUpperCase();
  const raderAt = normalizedRaderAtInput || AUTO_RADER;

  if (!username) {
    throw new Error("Missing username for one of the autosign accounts.");
  }

  if (!password) {
    throw new Error(`Missing password for autosign account ${username}.`);
  }

  if (raderAt !== AUTO_RADER && !RaderInfo[raderAt]) {
    throw new Error(
      `Unknown raderAt "${raderAt}" for autosign account ${username}. Available values: ${AUTO_RADER}, ${Object.keys(RaderInfo).join(", ")}`
    );
  }

  return {
    username,
    password,
    label: label || username,
    raderAt,
  };
}

async function loadAccountsFromFile(filePath, defaults) {
  const resolvedPath = resolveAccountsFilePath(filePath);
  const fileText = await fs.readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(fileText);
  const rawAccounts = Array.isArray(parsed) ? parsed : parsed.accounts;

  if (!Array.isArray(rawAccounts)) {
    throw new Error("Accounts file must be a JSON array or an object with an accounts array.");
  }

  return rawAccounts.map((account) => normalizeAccount(account, defaults));
}

async function promptForAccounts(defaults) {
  const accounts = [];
  let isFirstAccount = true;
  let shouldContinue = true;

  while (shouldContinue) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "username",
        message: "请输入学号",
        default: isFirstAccount ? defaults.username : "",
        validate: (value) => (String(value).trim() ? true : "学号不能为空"),
      },
      {
        type: "password",
        name: "password",
        message: "请输入统一认证密码",
        mask: "*",
        validate: (value) => (String(value) ? true : "密码不能为空"),
      },
      {
        type: "input",
        name: "label",
        message: "给这个账号起一个显示名称（可留空）",
        default: isFirstAccount ? defaults.label : "",
      },
      {
        type: "list",
        name: "raderAt",
        message: "请选择默认签到地点",
        default: isFirstAccount ? defaults.raderAt : AUTO_RADER,
        choices: LOCATION_CHOICES,
      },
    ]);

    accounts.push(normalizeAccount(answers, defaults));

    const { addMore } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addMore",
        message: "继续添加下一个账号吗？",
        default: false,
      },
    ]);

    shouldContinue = addMore;
    isFirstAccount = false;
  }

  return accounts;
}

async function resolveAccounts(cliArgs) {
  const sharedDefaults = {
    raderAt: cliArgs.raderAt || AUTO_RADER,
  };

  const singleAccountDefaults = {
    username: process.env.ZJU_USERNAME || "",
    password: process.env.ZJU_PASSWORD || "",
    label: cliArgs.label || "",
    raderAt: sharedDefaults.raderAt,
  };

  const promptDefaults = {
    username: cliArgs.username || process.env.ZJU_USERNAME || "",
    label: cliArgs.label || "",
    raderAt: sharedDefaults.raderAt,
  };

  const accounts = [];

  if (cliArgs.accountsFile) {
    accounts.push(...(await loadAccountsFromFile(cliArgs.accountsFile, sharedDefaults)));
  }

  if (cliArgs.prompt) {
    accounts.push(...(await promptForAccounts(promptDefaults)));
  } else if (cliArgs.username || cliArgs.password || cliArgs.label || cliArgs.raderAt) {
    accounts.push(
      normalizeAccount(
        {
          username: cliArgs.username || undefined,
          password: cliArgs.password || undefined,
          label: cliArgs.label || undefined,
          raderAt: cliArgs.raderAt || undefined,
        },
        singleAccountDefaults
      )
    );
  }

  if (accounts.length === 0) {
    accounts.push(
      normalizeAccount(
        {
          username: process.env.ZJU_USERNAME,
          password: process.env.ZJU_PASSWORD,
          label: cliArgs.label,
          raderAt: cliArgs.raderAt,
        },
        singleAccountDefaults
      )
    );
  }

  return accounts;
}

function printDryRun(accounts) {
  console.log(`[Auto Sign-in] Resolved ${accounts.length} account(s):`);
  for (const account of accounts) {
    console.log(
      `- ${account.label} (${account.username}) @ ${account.raderAt} / ${LOCATION_LABELS[account.raderAt] ?? account.raderAt}`
    );
  }
}

function createMessenger(account) {
  const prefix = `[Auto Sign-in][${account.label}]`;

  const log = (...args) => {
    console.log(prefix, ...args);
  };

  const notify = (...args) => {
    log(...args);
    dingTalk(`${prefix} ${stringifyArgs(args)}`);
  };

  const heartbeat = (message) => {
    dingTalk(`${prefix} ${message}`);
  };

  return { log, notify, heartbeat };
}

async function startAutoSignInstance(account) {
  const { COURSES, ZJUAM } = await import("login-zju");
  const courses = new COURSES(new ZJUAM(account.username, account.password));
  const { log, notify, heartbeat } = createMessenger(account);
  const currentConfig = {
    ...CONFIG,
    raderAt: account.raderAt,
  };

  let reqNum = 0;
  const weAreBruteforcing = new Set();
  const currentBatchingRCs = new Set();

  async function answerRaderRollcall(rid) {
    async function requestAt(x, y) {
      return courses
        .fetch(`https://courses.zju.edu.cn/api/rollcall/${rid}/answer?api_version=1.1.2`, {
          body: JSON.stringify({
            deviceId: uuidv4(),
            latitude: y,
            longitude: x,
            speed: null,
            accuracy: 68,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
          }),
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
        })
        .then(async (response) => {
          try {
            return await response.json();
          } catch (error) {
            log("[-] Failed to parse radar rollcall response.", error);
            return null;
          }
        });
    }

    const radarOutcome = [];
    const configuredRadarXY =
      currentConfig.raderAt && currentConfig.raderAt !== AUTO_RADER
        ? RaderInfo[currentConfig.raderAt]
        : null;

    if (configuredRadarXY) {
      const outcome = await requestAt(configuredRadarXY[0], configuredRadarXY[1]);
      if (outcome?.status_name === "on_call_fine") {
        notify(`Trying configured Rader location: ${currentConfig.raderAt} with outcome:`, outcome);
        return true;
      }

      log(`Failed to get outcome from configured Rader location: ${currentConfig.raderAt}`, outcome);
      radarOutcome.push([configuredRadarXY, outcome]);
    }

    for (const [key, value] of Object.entries(RaderInfo)) {
      log(`Trying Rader location: ${key}`);
      const outcome = await requestAt(value[0], value[1]);

      if (outcome?.status_name === "on_call_fine") {
        notify(`Congradulations! You are on the call at Rader location: ${key}`);
        return true;
      }

      radarOutcome.push([value, outcome]);
    }

    if (radarOutcome.length > 3) {
      radarOutcome
        .filter((value) => value[1]?.error_code === "radar_out_of_rollcall_scope")
        .map((value) => [value[0][0], value[0][1], value[1].distance]);
    }

    if (!configuredRadarXY) {
      return false;
    }

    return courses
      .fetch(`https://courses.zju.edu.cn/api/rollcall/${rid}/answer?api_version=1.1.2`, {
        body: JSON.stringify({
          deviceId: uuidv4(),
          latitude: configuredRadarXY?.[1],
          longitude: configuredRadarXY?.[0],
          speed: null,
          accuracy: 68,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
        }),
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
      })
      .then((response) => response.text())
      .then((payload) => {
        try {
          const outcome = JSON.parse(payload);
          if (outcome.status_name === "on_call_fine") {
            notify(`Rader Rollcall ${rid} succeeded: on call fine.`);
          }
        } catch (error) {
          log("Rader Rollcall resulted with unknown outcome:", payload);
          notify(`Rader Rollcall ${rid} resulted with unknown outcome: ${payload}`);
          return false;
        }

        return false;
      });
  }

  async function answerNumberRollcall(numberCode, rid) {
    return courses
      .fetch(`https://courses.zju.edu.cn/api/rollcall/${rid}/answer_number_rollcall`, {
        body: JSON.stringify({
          deviceId: uuidv4(),
          numberCode,
        }),
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
      })
      .then(async (response) => {
        if (response.status !== 200) {
          return false;
        }
        return true;
      });
  }

  async function batchNumberRollCall(rid) {
    if (currentBatchingRCs.has(rid)) {
      return;
    }

    currentBatchingRCs.add(rid);

    const state = new Map();
    state.set("found", false);

    const batchSize = 200;
    let foundCode = null;

    for (let start = 0; start <= 9999; start += batchSize) {
      if (state.get("found")) {
        break;
      }

      const end = Math.min(start + batchSize - 1, 9999);
      const tasks = [];

      for (let currentNumber = start; currentNumber <= end; currentNumber++) {
        const code = currentNumber.toString().padStart(4, "0");

        tasks.push(
          answerNumberRollcall(code, rid).then((success) => {
            if (state.get("found")) {
              return;
            }

            if (success) {
              foundCode = code;
              state.set("found", true);
            }
          })
        );
      }

      await Promise.race([
        Promise.all(tasks),
        new Promise((resolve) => {
          const timer = setInterval(() => {
            if (state.get("found")) {
              clearInterval(timer);
              resolve();
            }
          }, 20);
        }),
      ]);

      if (state.get("found")) {
        break;
      }
    }

    if (foundCode) {
      notify(`Number Rollcall ${rid} succeeded: found code ${foundCode}.`);
      return;
    }

    notify(`Number Rollcall ${rid} failed to find valid code.`);
  }

  notify(
    `Logged in as ${account.username}. ${
      account.raderAt === AUTO_RADER
        ? "Mode=AUTO (scan all known radar points)"
        : `Preferred raderAt=${account.raderAt}`
    }`
  );

  while (true) {
    const currentReq = ++reqNum;

    await courses
      .fetch("https://courses.zju.edu.cn/api/radar/rollcalls")
      .then((response) => response.text())
      .then(async (payload) => {
        try {
          return await JSON.parse(payload);
        } catch (error) {
          notify(`[-] Something went wrong: ${payload}\nError: ${error}`);
          return null;
        }
      })
      .then(async (result) => {
        if (!result) {
          return;
        }

        const rollcalls = Array.isArray(result.rollcalls) ? result.rollcalls : [];

        if (rollcalls.length === 0) {
          log(`(Req #${currentReq}) No rollcalls found.`);
          if (currentReq % 100 === 0) {
            heartbeat(`(Req #${currentReq}) No rollcalls found. (Heartbeat at ${new Date().toLocaleTimeString()})`);
          }
          return;
        }

        log(
          `(Req #${currentReq}) Found ${rollcalls.length} rollcalls.\nThey are:${rollcalls.map(
            (rollcall) =>
              `\n- ${rollcall.title} @ ${rollcall.course_title} by ${rollcall.created_by_name} (${rollcall.department_name})`
          )}`
        );

        for (const rollcall of rollcalls) {
          const rollcallId = rollcall.rollcall_id;

          if (
            rollcall.status === "on_call_fine" ||
            rollcall.status === "on_call" ||
            rollcall.status_name === "on_call_fine" ||
            rollcall.status_name === "on_call"
          ) {
            log(`Note that #${rollcallId} is on call.`);
            continue;
          }

          log(`Now answering rollcall #${rollcallId}`);
          notify(
            `Detected active rollcall #${rollcallId}: ${rollcall.title} @ ${rollcall.course_title} by ${rollcall.created_by_name} (${rollcall.department_name}) [Status: ${rollcall.status}]`
          );

          if (rollcall.is_radar) {
            answerRaderRollcall(rollcallId);
          }

          if (rollcall.is_number) {
            if (weAreBruteforcing.has(rollcallId)) {
              log(`We are already bruteforcing rollcall #${rollcallId}`);
            } else {
              weAreBruteforcing.add(rollcallId);
              batchNumberRollCall(rollcallId);
            }
          }
        }
      })
      .catch((error) => {
        log(`(Req #${currentReq}) Failed to fetch rollcalls:`, error);
      });

    await sleep(currentConfig.coldDownTime);
  }
}

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));

  if (cliArgs.help) {
    printHelp();
    return;
  }

  const accounts = await resolveAccounts(cliArgs);

  if (cliArgs.dryRun) {
    printDryRun(accounts);
    return;
  }

  console.log(
    `[Auto Sign-in] Starting ${accounts.length} account instance(s): ${accounts
      .map((account) => `${account.label}(${account.username})`)
      .join(", ")}`
  );

  await Promise.all(
    accounts.map((account) =>
      startAutoSignInstance(account).catch((error) => {
        console.error(`[Auto Sign-in][${account.label}] Fatal error:`, error);
      })
    )
  );
}

main().catch((error) => {
  console.error("[Auto Sign-in] Failed to start:", error);
  process.exitCode = 1;
});
