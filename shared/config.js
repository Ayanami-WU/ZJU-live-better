import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultEnvFile = ".env";

function argumentValue(name) {
    const index = process.argv.indexOf(name);
    if (index === -1) return undefined;
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) {
        throw new Error(`[Config] ${name} requires a file path.`);
    }
    return value;
}

// dotenv preserves existing environment values, including explicitly empty ones.
const envFile = argumentValue("--env") || process.env.ENV_FILE || defaultEnvFile;
const envPath = path.resolve(projectRoot, envFile);
const defaultEnvPath = path.resolve(projectRoot, defaultEnvFile);
let envMissing = false;
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else if (envFile !== defaultEnvFile && fs.existsSync(defaultEnvPath)) {
    console.warn(`[Config] Selected env file not found. Falling back to ${defaultEnvFile}.`);
    dotenv.config({ path: defaultEnvPath });
} else {
    envMissing = true;
}

function invalid(field, expected) {
    throw new Error(`[Config] ${field} must be ${expected}.`);
}

function object(value, field) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        invalid(field, "an object");
    }
}

function string(value, field, nonempty = false) {
    if (typeof value !== "string" || (nonempty && value.trim().length === 0)) {
        invalid(field, nonempty ? "a nonempty string" : "a string");
    }
}

function boolean(value, field) {
    if (typeof value !== "boolean") invalid(field, "a boolean");
}

function integer(value, field, minimum, maximum = Infinity) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        invalid(field, maximum === Infinity
            ? `an integer greater than or equal to ${minimum}`
            : `an integer between ${minimum} and ${maximum}`);
    }
}

function positiveNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        invalid(field, "a positive number");
    }
}

function rejectWebvpn(value) {
    if (Object.hasOwn(value, "webvpn")) {
        throw new Error("[Config] webvpn is not supported by these scripts; remove that setting.");
    }
}

function validate(config) {
    object(config, "config");
    rejectWebvpn(config);
    if (Object.hasOwn(config, "users")) {
        if (!Array.isArray(config.users)) invalid("users", "an array");
        config.users.forEach((user, index) => {
            const field = `users[${index}]`;
            object(user, field);
            rejectWebvpn(user);
            string(user.username, `${field}.username`, true);
            string(user.password, `${field}.password`, true);
            for (const key of ["label", "radarAt"]) {
                if (Object.hasOwn(user, key)) string(user[key], `${field}.${key}`);
            }
        });
    }
    const sections = {
        autosign: {
            radarAt: string,
            pollIntervalMs: (value, field) => integer(value, field, 1),
            heartbeatEvery: (value, field) => integer(value, field, 0),
        },
        dingtalk: { enabled: boolean, webhook: string, secret: string },
        gradeMonitor: {
            statePath: string,
            startHour: (value, field) => integer(value, field, 0, 23),
            endHour: (value, field) => integer(value, field, 1, 24),
            intervalSeconds: positiveNumber,
            requestTimeoutMs: positiveNumber,
            notifyInitial: boolean,
            checkEvaluation: boolean,
        },
        classroom: { downloadPath: string },
    };
    for (const [section, fields] of Object.entries(sections)) {
        if (!Object.hasOwn(config, section)) continue;
        object(config[section], section);
        rejectWebvpn(config[section]);
        for (const [key, check] of Object.entries(fields)) {
            if (Object.hasOwn(config[section], key)) check(config[section][key], `${section}.${key}`);
        }
    }
    const grade = config.gradeMonitor;
    if (grade?.startHour !== undefined && grade.endHour !== undefined && grade.startHour >= grade.endHour) {
        throw new Error("[Config] gradeMonitor.startHour must be less than gradeMonitor.endHour.");
    }
    return config;
}

const selectedConfig = argumentValue("--config") || process.env.LIVE_BETTER_CONFIG_FILE;
const defaultConfigPath = path.join(projectRoot, "config.json");
export const configPath = selectedConfig
    ? path.resolve(process.cwd(), selectedConfig)
    : fs.existsSync(defaultConfigPath) ? defaultConfigPath : null;

function readConfig() {
    if (!configPath) return {};
    let source;
    try {
        source = fs.readFileSync(configPath, "utf8");
    } catch {
        throw new Error("[Config] Cannot read the selected JSON config file.");
    }
    let parsed;
    try {
        parsed = JSON.parse(source);
    } catch {
        // JSON parser diagnostics may include a user's password or webhook.
        throw new Error("[Config] Invalid JSON in the selected config file.");
    }
    return validate(parsed);
}

export const config = readConfig();

function fallback(name, value) {
    if (value !== undefined && process.env[name] === undefined) {
        process.env[name] = String(value);
    }
}

if (config.users?.length) {
    fallback("ZJU_USERNAME", config.users[0].username);
    fallback("ZJU_PASSWORD", config.users[0].password);
}
const mappings = {
    dingtalk: {
        enabled: "ENABLE_DINGTALK", webhook: "DINGTALK_WEBHOOK", secret: "DINGTALK_SECRET",
    },
    gradeMonitor: {
        statePath: "GRADE_STATE_PATH", startHour: "GRADE_MONITOR_START_HOUR", endHour: "GRADE_MONITOR_END_HOUR",
        intervalSeconds: "GRADE_MONITOR_INTERVAL_SECONDS", requestTimeoutMs: "GRADE_REQUEST_TIMEOUT_MS",
        notifyInitial: "GRADE_NOTIFY_INITIAL", checkEvaluation: "GRADE_CHECK_EVALUATION",
    },
    classroom: { downloadPath: "CLASSROOM_DOWNLOAD_PATH" },
};
for (const [section, fields] of Object.entries(mappings)) {
    for (const [key, envName] of Object.entries(fields)) {
        fallback(envName, config[section]?.[key]);
    }
}

if (envMissing && !configPath && !process.env.ZJU_USERNAME && !process.env.ZJU_PASSWORD) {
    console.warn(`[Config] Warning: ${defaultEnvFile} not found.`);
}
