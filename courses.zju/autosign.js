import { v4 as uuidv4 } from "uuid";
import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import "../shared/config.js";
import dingTalk from "../shared/dingtalk-webhook.js";
import Decimal from "decimal.js";

Decimal.set({ precision: 100 });

const CONFIG = {
  radarAt: "ZJGD1",
  coldDownTime: 4000,
};

const AUTO_RADAR = "AUTO";

const RadarInfo = {
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
    name: `${AUTO_RADAR} - ${LOCATION_LABELS[AUTO_RADAR]}（推荐）`,
    value: AUTO_RADAR,
  },
  ...Object.keys(RadarInfo).map((code) => ({
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
    radarAt: "",
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
      case "--radarAt":
      case "--raderAt":
      case "--radar-at":
      case "--rader-at":
      case "--location":
        parsed.radarAt = nextValue();
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
  node courses.zju/autosign.js --username 12345678 --password your_password --radarAt AUTO
  node courses.zju/autosign.js --prompt
  node courses.zju/autosign.js --accounts-file ./autosign-users.json

Options:
  --username, -u       Override ZJU_USERNAME for a single user
  --password, -p       Override ZJU_PASSWORD for a single user
  --label              Optional display name used in logs
  --radarAt            Preferred location code, or AUTO to scan all known points
  --raderAt            Backward-compatible alias for --radarAt
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
    "radarAt": "AUTO"
  },
  {
    "label": "室友",
    "username": "2021123456",
    "password": "password2",
    "radarAt": "ZJGD1"
  }
]

Tips:
  1. --password 会留在 shell 历史里，平时更建议用 --prompt。
  2. 不传参数时，脚本仍然会回退到 env 里的 ZJU_USERNAME 和 ZJU_PASSWORD。
  3. radarAt 现在是可选优化项；用 AUTO 时会自动轮询全部已知点位。
  4. 旧配置里的 raderAt / rader_at 仍然兼容。
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
  const radarAtValue =
    rawAccount.radarAt ??
    rawAccount.raderAt ??
    rawAccount.radar_at ??
    rawAccount.rader_at ??
    rawAccount.location ??
    defaults.radarAt ??
    CONFIG.radarAt;

  const username = String(usernameValue).trim();
  const password = String(passwordValue);
  const label = String(labelValue).trim();
  const normalizedRadarAtInput = String(radarAtValue).trim().toUpperCase();
  const radarAt = normalizedRadarAtInput || AUTO_RADAR;

  if (!username) {
    throw new Error("Missing username for one of the autosign accounts.");
  }

  if (!password) {
    throw new Error(`Missing password for autosign account ${username}.`);
  }

  if (radarAt !== AUTO_RADAR && !RadarInfo[radarAt]) {
    throw new Error(
      `Unknown radarAt "${radarAt}" for autosign account ${username}. Available values: ${AUTO_RADAR}, ${Object.keys(RadarInfo).join(", ")}`
    );
  }

  return {
    username,
    password,
    label: label || username,
    radarAt,
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
        name: "radarAt",
        message: "请选择默认签到地点",
        default: isFirstAccount ? defaults.radarAt : AUTO_RADAR,
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
    radarAt: cliArgs.radarAt || AUTO_RADAR,
  };

  const singleAccountDefaults = {
    username: process.env.ZJU_USERNAME || "",
    password: process.env.ZJU_PASSWORD || "",
    label: cliArgs.label || "",
    radarAt: sharedDefaults.radarAt,
  };

  const promptDefaults = {
    username: cliArgs.username || process.env.ZJU_USERNAME || "",
    label: cliArgs.label || "",
    radarAt: sharedDefaults.radarAt,
  };

  const accounts = [];

  if (cliArgs.accountsFile) {
    accounts.push(...(await loadAccountsFromFile(cliArgs.accountsFile, sharedDefaults)));
  }

  if (cliArgs.prompt) {
    accounts.push(...(await promptForAccounts(promptDefaults)));
  } else if (cliArgs.username || cliArgs.password || cliArgs.label || cliArgs.radarAt) {
    accounts.push(
      normalizeAccount(
        {
          username: cliArgs.username || undefined,
          password: cliArgs.password || undefined,
          label: cliArgs.label || undefined,
          radarAt: cliArgs.radarAt || undefined,
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
          radarAt: cliArgs.radarAt,
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
      `- ${account.label} (${account.username}) @ ${account.radarAt} / ${LOCATION_LABELS[account.radarAt] ?? account.radarAt}`
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
    void dingTalk(`${prefix} ${stringifyArgs(args)}`);
  };

  const heartbeat = (message) => {
    void dingTalk(`${prefix} ${message}`);
  };

  return { log, notify, heartbeat };
}

function decimalHaversineDist(lon, lat, lonI, latI, radius) {
  const deg = Decimal.acos(-1).div(180);

  const lambda = new Decimal(lon).mul(deg);
  const phi = new Decimal(lat).mul(deg);
  const lambdaI = new Decimal(lonI).mul(deg);
  const phiI = new Decimal(latI).mul(deg);

  const dPhi = phi.minus(phiI);
  const dLambda = lambda.minus(lambdaI);

  const sinDPhiHalf = dPhi.div(2).sin().pow(2);
  const sinDLambdaHalf = dLambda.div(2).sin().pow(2);
  const h = sinDPhiHalf.plus(phi.cos().mul(phiI.cos()).mul(sinDLambdaHalf));

  return radius.mul(Decimal.asin(h.sqrt()).mul(2));
}

function residualsDecimal(lon, lat, points, radius) {
  return points.map((point) => {
    const dist = decimalHaversineDist(lon, lat, point.lon, point.lat, radius);
    return new Decimal(point.d).minus(dist);
  });
}

function jacobianDecimal(lon, lat, points, radius) {
  const eps = new Decimal("1e-12");
  const base = residualsDecimal(lon, lat, points, radius);
  const resLon = residualsDecimal(new Decimal(lon).plus(eps), lat, points, radius);
  const resLat = residualsDecimal(lon, new Decimal(lat).plus(eps), points, radius);

  return points.map((_, index) => {
    const dLon = resLon[index].minus(base[index]).div(eps).neg();
    const dLat = resLat[index].minus(base[index]).div(eps).neg();
    return [dLon, dLat];
  });
}

function gaussNewtonDecimal(points, lon0, lat0, radius, log) {
  let lon = new Decimal(lon0);
  let lat = new Decimal(lat0);

  for (let iter = 0; iter < 30; iter++) {
    const residuals = residualsDecimal(lon, lat, points, radius);
    const jacobian = jacobianDecimal(lon, lat, points, radius);

    const jtj = [
      [new Decimal(0), new Decimal(0)],
      [new Decimal(0), new Decimal(0)],
    ];
    const jtr = [new Decimal(0), new Decimal(0)];

    for (let index = 0; index < points.length; index++) {
      const row = jacobian[index];
      const residual = residuals[index];

      jtj[0][0] = jtj[0][0].plus(row[0].mul(row[0]));
      jtj[0][1] = jtj[0][1].plus(row[0].mul(row[1]));
      jtj[1][0] = jtj[1][0].plus(row[1].mul(row[0]));
      jtj[1][1] = jtj[1][1].plus(row[1].mul(row[1]));

      jtr[0] = jtr[0].plus(row[0].mul(residual));
      jtr[1] = jtr[1].plus(row[1].mul(residual));
    }

    const det = jtj[0][0].mul(jtj[1][1]).minus(jtj[0][1].mul(jtj[1][0]));
    if (det.isZero()) {
      log?.("[Autosign][SphereFit] Singular matrix, stopping iteration.");
      break;
    }

    const inverse = [
      [jtj[1][1].div(det), jtj[0][1].neg().div(det)],
      [jtj[1][0].neg().div(det), jtj[0][0].div(det)],
    ];

    const dLon = inverse[0][0].mul(jtr[0]).plus(inverse[0][1].mul(jtr[1]));
    const dLat = inverse[1][0].mul(jtr[0]).plus(inverse[1][1].mul(jtr[1]));

    lon = lon.plus(dLon);
    lat = lat.plus(dLat);

    log?.(`[Autosign][SphereFit][Iter ${iter}] lon = ${lon}, lat = ${lat}`);

    if (dLon.abs().lt("1e-14") && dLat.abs().lt("1e-14")) {
      break;
    }
  }

  return { lon, lat };
}

function rmsDecimal(lon, lat, points, radius) {
  const sum = points.reduce((currentSum, point) => {
    const dModel = decimalHaversineDist(lon, lat, point.lon, point.lat, radius);
    const diff = new Decimal(point.d).minus(dModel);
    return currentSum.plus(diff.mul(diff));
  }, new Decimal(0));

  return sum.div(points.length).sqrt();
}

function solveSphereLeastSquaresDecimal(rawPoints, log) {
  const lon0 = rawPoints.reduce((sum, point) => sum + point.lon, 0) / rawPoints.length;
  const lat0 = rawPoints.reduce((sum, point) => sum + point.lat, 0) / rawPoints.length;
  const radius = new Decimal("6372999.26");
  const result = gaussNewtonDecimal(rawPoints, lon0, lat0, radius, log);
  const rms = rmsDecimal(result.lon, result.lat, rawPoints, radius);

  return {
    lon: Number(result.lon),
    lat: Number(result.lat),
    rms: Number(rms),
  };
}

function extractNumberCode(data) {
  const value =
    data?.number_code ??
    data?.numberCode ??
    data?.student_rollcall?.number_code ??
    data?.student_rollcalls?.[0]?.number_code ??
    data?.[0]?.number_code;

  if (value === undefined || value === null || value === "") {
    return "";
  }

  return String(value).trim().padStart(4, "0");
}

async function startAutoSignInstance(account) {
  const { COURSES, ZJUAM } = await import("login-zju");
  const courses = new COURSES(new ZJUAM(account.username, account.password));
  const { log, notify, heartbeat } = createMessenger(account);
  const currentConfig = {
    ...CONFIG,
    radarAt: account.radarAt,
  };

  let reqNum = 0;
  const weAreBruteforcing = new Set();
  const currentBatchingRCs = new Set();

  async function answerRadarRollcall(rid) {
    async function requestAt(lon, lat) {
      return courses
        .fetch(`https://courses.zju.edu.cn/api/rollcall/${rid}/answer?api_version=1.1.2`, {
          body: JSON.stringify({
            deviceId: uuidv4(),
            latitude: lat,
            longitude: lon,
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
      currentConfig.radarAt && currentConfig.radarAt !== AUTO_RADAR
        ? RadarInfo[currentConfig.radarAt]
        : null;

    if (configuredRadarXY) {
      const outcome = await requestAt(configuredRadarXY[0], configuredRadarXY[1]);
      if (outcome?.status_name === "on_call_fine") {
        notify(`Configured radar location ${currentConfig.radarAt} succeeded:`, outcome);
        return true;
      }

      log(`Configured radar location ${currentConfig.radarAt} failed:`, outcome);
      radarOutcome.push([configuredRadarXY, outcome]);
    }

    for (const [key, value] of Object.entries(RadarInfo)) {
      if (value === configuredRadarXY) {
        continue;
      }

      log(`Trying radar location: ${key}`);
      const outcome = await requestAt(value[0], value[1]);

      if (outcome?.status_name === "on_call_fine") {
        notify(`Radar rollcall ${rid} succeeded at location: ${key}`);
        return true;
      }

      radarOutcome.push([value, outcome]);
    }

    const rawPoints = radarOutcome.flatMap(([coord, outcome]) => {
      const distance = Number(outcome?.distance ?? outcome?.data?.distance ?? outcome?.result?.distance);
      if (!Number.isFinite(distance) || distance <= 0) {
        return [];
      }
      return [{ lon: coord[0], lat: coord[1], d: distance }];
    });

    if (rawPoints.length < 3) {
      log("[Autosign][SphereFit] Not enough distance points.");
      return false;
    }

    const estimated = solveSphereLeastSquaresDecimal(rawPoints, log);
    log("[Autosign][SphereFit] Estimated position:", estimated);

    const finalOutcome = await requestAt(estimated.lon, estimated.lat);
    if (finalOutcome?.status_name === "on_call_fine") {
      notify(`Radar rollcall ${rid} succeeded at estimated position: ${estimated.lon}, ${estimated.lat}`);
      return true;
    }

    log(`Radar rollcall ${rid} failed at estimated position:`, finalOutcome);
    return false;
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
      .then(async (response) => response.status === 200);
  }

  async function getNumberCode(rid) {
    return courses
      .fetch(`https://courses.zju.edu.cn/api/rollcall/${rid}/student_rollcalls`)
      .then(async (response) => {
        try {
          return await response.json();
        } catch (error) {
          log("[Autosign][JSON error]", error);
          return null;
        }
      });
  }

  async function batchNumberRollCall(rid) {
    if (currentBatchingRCs.has(rid)) {
      return;
    }

    currentBatchingRCs.add(rid);

    const state = new Map();
    state.set("found", false);
    let foundCode = null;

    const directCode = extractNumberCode(await getNumberCode(rid));
    if (directCode) {
      log(`Trying number code from student_rollcalls API: ${directCode}`);
      const success = await answerNumberRollcall(directCode, rid);
      if (success) {
        notify(`Number Rollcall ${rid} succeeded with API code ${directCode}.`);
        return;
      }
      log(`Number code from API did not work for rollcall ${rid}. Falling back to brute force.`);
    }

    const batchSize = 200;

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
      account.radarAt === AUTO_RADAR
        ? "Mode=AUTO (scan all known radar points)"
        : `Preferred radarAt=${account.radarAt}`
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

          let handled = false;

          if (rollcall.is_radar) {
            handled = true;
            void answerRadarRollcall(rollcallId).catch((error) => {
              notify(`Radar rollcall ${rollcallId} failed:`, error);
            });
          }

          if (rollcall.is_number) {
            handled = true;
            if (weAreBruteforcing.has(rollcallId)) {
              log(`We are already handling number rollcall #${rollcallId}`);
            } else {
              weAreBruteforcing.add(rollcallId);
              void batchNumberRollCall(rollcallId).catch((error) => {
                notify(`Number rollcall ${rollcallId} failed:`, error);
              });
            }
          }

          if (!handled) {
            log(`Rollcall #${rollcallId} has an unknown type and cannot be handled yet.`);
            log("Rollcall details:", rollcall);
            notify(`Unknown rollcall type for #${rollcallId}. Please inspect logs and consider submitting an issue.`);
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
