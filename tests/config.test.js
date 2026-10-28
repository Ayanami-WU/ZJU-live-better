import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, "shared/config.js");
const source = fs.readFileSync(filename, "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

async function load({ env = {}, argv = [], files = {}, envFiles = {}, cwd = "/test-cwd" } = {}) {
    const environment = { ...env };
    const warnings = [];
    const dotenvPaths = [];
    const context = vm.createContext({
        process: { argv: ["node", "script.js", ...argv], env: environment, cwd: () => cwd },
        console: { warn: (message) => warnings.push(message) },
    });
    const mockedFs = {
        existsSync: (file) => Object.hasOwn(files, file) || Object.hasOwn(envFiles, file),
        readFileSync(file) {
            if (!Object.hasOwn(files, file)) throw new Error("private underlying filesystem detail");
            return files[file];
        },
    };
    const mockedDotenv = {
        config({ path: file }) {
            dotenvPaths.push(file);
            for (const [key, value] of Object.entries(envFiles[file] || {})) {
                if (environment[key] === undefined) environment[key] = value;
            }
        },
    };
    const dependencies = {
        dotenv: { default: mockedDotenv }, fs: { default: mockedFs },
        path: { default: path }, url: { fileURLToPath },
    };
    const module = new vm.SourceTextModule(source, {
        context, identifier: pathToFileURL(filename).href,
        initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
    });
    await module.link((specifier) => {
        assert.ok(Object.hasOwn(dependencies, specifier), `known dependency ${specifier}`);
        const values = dependencies[specifier];
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return { config: module.namespace.config, configPath: module.namespace.configPath, env: environment, warnings, dotenvPaths };
}

const defaults = {
    users: [{ username: "json-user", password: "json-secret", label: "First", radarAt: "AUTO" }],
    autosign: { radarAt: "YQ4", pollIntervalMs: 5000, heartbeatEvery: 0 },
    dingtalk: { enabled: false, webhook: "json-hook", secret: "json-signing-secret" },
    gradeMonitor: {
        statePath: "/data/grades.json", startHour: 9, endHour: 22,
        intervalSeconds: 120, requestTimeoutMs: 20000, notifyInitial: false, checkEvaluation: true,
    },
    classroom: { downloadPath: "/data/downloads" },
};

test("default JSON maps known settings and leaves the exported raw config unchanged", async () => {
    const original = JSON.stringify(defaults);
    const result = await load({ files: { [path.join(root, "config.json")]: original } });
    assert.equal(result.configPath, path.join(root, "config.json"));
    assert.deepEqual(plain(result.config), defaults);
    assert.deepEqual(result.env, {
        ZJU_USERNAME: "json-user", ZJU_PASSWORD: "json-secret",
        ENABLE_DINGTALK: "false", DINGTALK_WEBHOOK: "json-hook", DINGTALK_SECRET: "json-signing-secret",
        GRADE_STATE_PATH: "/data/grades.json", GRADE_MONITOR_START_HOUR: "9", GRADE_MONITOR_END_HOUR: "22",
        GRADE_MONITOR_INTERVAL_SECONDS: "120", GRADE_REQUEST_TIMEOUT_MS: "20000",
        GRADE_NOTIFY_INITIAL: "false", GRADE_CHECK_EVALUATION: "true", CLASSROOM_DOWNLOAD_PATH: "/data/downloads",
    });
    assert.equal(JSON.stringify(result.config), original);
    assert.deepEqual(result.warnings, []);
});

test("runtime environment takes precedence over dotenv and JSON, including explicit blanks", async () => {
    const result = await load({
        env: { ZJU_USERNAME: "runtime-user", ZJU_PASSWORD: "", DINGTALK_SECRET: "", GRADE_MONITOR_END_HOUR: "24" },
        envFiles: { [path.join(root, ".env")]: {
            ZJU_USERNAME: "dotenv-user", ZJU_PASSWORD: "dotenv-secret", DINGTALK_SECRET: "dotenv-signing-secret",
            ENABLE_DINGTALK: "true", DINGTALK_WEBHOOK: "", GRADE_MONITOR_START_HOUR: "8",
        } },
        files: { [path.join(root, "config.json")]: JSON.stringify(defaults) },
    });
    assert.equal(result.env.ZJU_USERNAME, "runtime-user");
    assert.equal(result.env.ZJU_PASSWORD, "");
    assert.equal(result.env.DINGTALK_SECRET, "");
    assert.equal(result.env.DINGTALK_WEBHOOK, "");
    assert.equal(result.env.ENABLE_DINGTALK, "true");
    assert.equal(result.env.GRADE_MONITOR_START_HOUR, "8");
    assert.equal(result.env.GRADE_MONITOR_END_HOUR, "24");
    assert.equal(result.env.GRADE_STATE_PATH, "/data/grades.json");
});

test("--config overrides the environment selector and resolves relative to the working directory", async () => {
    const result = await load({
        argv: ["--config", "selected.json"], env: { LIVE_BETTER_CONFIG_FILE: "ignored.json" },
        files: { "/test-cwd/selected.json": '{"users":[]}', [path.join(root, "config.json")]: '{"users":[{"username":"ignored","password":"ignored"}]}' },
    });
    assert.equal(result.configPath, "/test-cwd/selected.json");
    assert.deepEqual(plain(result.config), { users: [] });
    assert.equal(result.env.ZJU_USERNAME, undefined);
});

test("JSON file selection can come from the selected dotenv file", async () => {
    const result = await load({
        argv: ["--env", "custom.env"], env: { ENV_FILE: "ignored.env" },
        envFiles: { [path.join(root, "custom.env")]: { LIVE_BETTER_CONFIG_FILE: "settings.json", ZJU_USERNAME: "env-user", ZJU_PASSWORD: "env-secret" } },
        files: { "/test-cwd/settings.json": '{"users":[],"dingtalk":{"enabled":false}}' },
    });
    assert.deepEqual(result.dotenvPaths, [path.join(root, "custom.env")]);
    assert.equal(result.configPath, "/test-cwd/settings.json");
    assert.equal(result.env.ZJU_USERNAME, "env-user");
    assert.equal(result.env.ENABLE_DINGTALK, "false");
});

test("ENV_FILE retains its default .env fallback and existing credentials", async () => {
    const result = await load({
        env: { ENV_FILE: "missing.env" },
        envFiles: { [path.join(root, ".env")]: { ZJU_USERNAME: "legacy-user", ZJU_PASSWORD: "legacy-secret" } },
    });
    assert.deepEqual(result.dotenvPaths, [path.join(root, ".env")]);
    assert.match(result.warnings[0], /Falling back to .env/);
    assert.equal(result.configPath, null);
    assert.deepEqual(plain(result.config), {});
    assert.equal(result.env.ZJU_USERNAME, "legacy-user");
});

test("missing optional default JSON leaves env-only operation intact and does not inspect /data", async () => {
    const result = await load({
        env: { ZJU_USERNAME: "legacy", ZJU_PASSWORD: "secret" },
        files: { "/data/config.json": JSON.stringify(defaults) },
    });
    assert.equal(result.configPath, null);
    assert.deepEqual(plain(result.config), {});
    assert.equal(result.env.ENABLE_DINGTALK, undefined);
    assert.deepEqual(result.warnings, []);
});

test("users can be omitted for non-autosign JSON settings", async () => {
    const result = await load({ files: { [path.join(root, "config.json")]: '{"gradeMonitor":{"notifyInitial":true}}' } });
    assert.equal(result.env.GRADE_NOTIFY_INITIAL, "true");
    assert.equal(result.env.ZJU_USERNAME, undefined);
});

test("explicit missing JSON and missing option values fail with sanitized errors", async () => {
    await assert.rejects(load({ argv: ["--config", "missing.json"] }), (error) => {
        assert.match(error.message, /Cannot read.*JSON config/);
        assert.doesNotMatch(error.message, /private underlying/);
        return true;
    });
    await assert.rejects(load({ env: { LIVE_BETTER_CONFIG_FILE: "missing.json" } }), /Cannot read/);
    await assert.rejects(load({ argv: ["--config"] }), /--config requires a file path/);
    await assert.rejects(load({ argv: ["--env", "--config", "anything.json"] }), /--env requires a file path/);
});

test("malformed JSON does not reveal parser snippets or credentials", async () => {
    await assert.rejects(load({ files: { [path.join(root, "config.json")]: '{"password":"NEVER_PRINT_THIS_SECRET", broken' } }), (error) => {
        assert.equal(error.message, "[Config] Invalid JSON in the selected config file.");
        assert.doesNotMatch(String(error.stack), /NEVER_PRINT|broken/);
        return true;
    });
});

for (const [name, value, pattern] of [
    ["root array", [], /config must be an object/],
    ["users object", { users: {} }, /users must be an array/],
    ["empty username", { users: [{ username: "", password: "secret" }] }, /username must be a nonempty string/],
    ["wrong password type", { users: [{ username: "x", password: 1234 }] }, /password must be a nonempty string/],
    ["wrong label type", { users: [{ username: "x", password: "secret", label: false }] }, /label must be a string/],
    ["null section", { autosign: null }, /autosign must be an object/],
    ["zero polling interval", { autosign: { pollIntervalMs: 0 } }, /pollIntervalMs must be an integer/],
    ["fractional polling interval", { autosign: { pollIntervalMs: 1.5 } }, /pollIntervalMs must be an integer/],
    ["negative heartbeat", { autosign: { heartbeatEvery: -1 } }, /heartbeatEvery must be an integer/],
    ["nonboolean DingTalk", { dingtalk: { enabled: "true" } }, /enabled must be a boolean/],
    ["nonstring webhook", { dingtalk: { webhook: 42 } }, /webhook must be a string/],
    ["invalid grade hour", { gradeMonitor: { endHour: 25 } }, /endHour must be an integer between/],
    ["reversed grade window", { gradeMonitor: { startHour: 20, endHour: 8 } }, /startHour must be less than/],
    ["invalid grade interval", { gradeMonitor: { intervalSeconds: 0 } }, /intervalSeconds must be a positive number/],
    ["invalid grade boolean", { gradeMonitor: { checkEvaluation: 1 } }, /checkEvaluation must be a boolean/],
    ["nonstring download path", { classroom: { downloadPath: false } }, /downloadPath must be a string/],
    ["unsupported webvpn", { webvpn: false }, /webvpn is not supported/],
    ["unsupported user webvpn", { users: [{ username: "x", password: "secret", webvpn: true }] }, /webvpn is not supported/],
]) {
    test(`invalid ${name} reports its field without exposing values`, async () => {
        await assert.rejects(load({ files: { [path.join(root, "config.json")]: JSON.stringify(value) } }), (error) => {
            assert.match(error.message, pattern);
            assert.doesNotMatch(error.message, /secret|1234/);
            return true;
        });
    });
}
