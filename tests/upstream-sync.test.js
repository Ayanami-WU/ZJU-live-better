import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plain = (value) => JSON.parse(JSON.stringify(value));
const stop = new Error("test polling completed");

// Run the real script bodies with module imports and I/O replaced. Removing only
// their automatic entrypoints lets tests call the existing functions directly.
async function loadScript(relative, options = {}) {
  const output = [];
  const fakeProcess = {
    env: {}, argv: ["node", relative], exitCode: 0,
    cwd: () => root, exit: (code) => { throw new Error(`unexpected exit ${code}`); },
    ...options.process,
  };
  const context = vm.createContext({
    console: Object.fromEntries(["log", "warn", "error"].map((level) => [
      level, (...args) => output.push(args.map(String).join(" ")),
    ])),
    process: fakeProcess, URL, URLSearchParams, AbortSignal,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => { throw new Error("unexpected real network request"); },
    ...options.globals,
  });
  const cache = new Map();
  const mocks = options.mocks || {};
  async function synthetic(identifier, values) {
    if (cache.has(identifier)) return cache.get(identifier);
    const keys = Object.keys(values);
    const module = new vm.SyntheticModule(keys, function () {
      for (const key of keys) this.setExport(key, values[key]);
    }, { context, identifier });
    cache.set(identifier, module);
    return module;
  }
  async function resolve(specifier, referring) {
    if (Object.hasOwn(mocks, specifier)) return synthetic(`mock:${specifier}`, mocks[specifier]);
    if (["path", "node:path", "url", "node:url"].includes(specifier)) {
      return synthetic(specifier, await import(specifier));
    }
    if (specifier.startsWith(".")) {
      return build(fileURLToPath(new URL(specifier, referring.identifier)));
    }
    throw new Error(`Unmocked dependency ${specifier}`);
  }
  async function build(filename, isTarget = false) {
    const identifier = pathToFileURL(filename).href;
    if (cache.has(identifier)) return cache.get(identifier);
    let source = fs.readFileSync(filename, "utf8");
    if (isTarget) {
      if (options.entrypoint) {
        const index = source.lastIndexOf(options.entrypoint);
        assert.notEqual(index, -1, `entrypoint marker exists in ${relative}`);
        source = source.slice(0, index);
      }
      source += `\nexport { ${(options.exports || []).join(", ")} };\n`;
    }
    const module = new vm.SourceTextModule(source, {
      context, identifier,
      initializeImportMeta(meta) { meta.url = identifier; },
      async importModuleDynamically(specifier, referencingModule) {
        const dependency = await resolve(specifier, referencingModule);
        if (dependency.status === "unlinked") await dependency.link(resolve);
        if (dependency.status === "linked") await dependency.evaluate();
        return dependency;
      },
    });
    cache.set(identifier, module);
    return module;
  }
  const module = await build(path.join(root, relative), true);
  await module.link(resolve);
  await module.evaluate();
  return { namespace: module.namespace, output, context, process: fakeProcess };
}

async function autosignHarness(payload, pollLimit) {
  const instances = [];
  const notifications = [];
  const requests = [];
  class ZJUAM {
    constructor(username, password) { this.username = username; this.password = password; }
  }
  class COURSES {
    constructor(auth) { this.auth = auth; this.polls = 0; instances.push(this); }
    async fetch(url, options = {}) {
      requests.push({ username: this.auth.username, url, method: options.method || "GET" });
      assert.equal(url, "https://courses.zju.edu.cn/api/radar/rollcalls");
      this.polls++;
      return { text: async () => JSON.stringify(payload) };
    }
  }
  const script = await loadScript("courses.zju/autosign.js", {
    entrypoint: "main().catch(",
    exports: ["startAutoSignInstance", "resolveAccounts", "parseCliArgs", "printDryRun"],
    mocks: {
      uuid: { v4: () => "test-device" }, inquirer: { default: {} },
      "fs/promises": { default: { readFile: async () => JSON.stringify([
        { username: "student-a", password: "fake-secret-a", label: "A" },
        { username: "student-b", password: "fake-secret-b", label: "B", raderAt: "YQ4" },
      ]) } },
      "../shared/config.js": {},
      "../shared/dingtalk-webhook.js": { default: async (message) => { notifications.push(message); } },
      "decimal.js": { default: { set() {} } }, "login-zju": { COURSES, ZJUAM },
    },
    globals: {
      setTimeout(callback) {
        if (instances.length === 2 && instances.every((instance) => instance.polls >= pollLimit)) throw stop;
        queueMicrotask(callback);
      },
    },
  });
  const accounts = await script.namespace.resolveAccounts(script.namespace.parseCliArgs(["--accounts-file", "dummy-accounts.json"]));
  assert.deepEqual(plain(accounts).map(({ username, label, radarAt }) => ({ username, label, radarAt })), [
    { username: "student-a", label: "A", radarAt: "AUTO" },
    { username: "student-b", label: "B", radarAt: "YQ4" },
  ]);
  script.namespace.printDryRun(accounts);
  assert.doesNotMatch(script.output.join("\n"), /fake-secret/);
  await Promise.all(accounts.map((account) => assert.rejects(script.namespace.startAutoSignInstance(account), (error) => error === stop)));
  return { instances, notifications, requests, ...script };
}

test("multiple accounts keep separate polling counters and heartbeat messages", async () => {
  const { instances, notifications } = await autosignHarness({ rollcalls: [] }, 100);
  assert.deepEqual(instances.map((instance) => instance.polls), [100, 100]);
  assert.deepEqual(instances.map((instance) => instance.auth.username).sort(), ["student-a", "student-b"]);
  const heartbeats = notifications.filter((message) => message.includes("Heartbeat at"));
  assert.equal(heartbeats.length, 2);
  assert.ok(heartbeats.some((message) => message.includes("[A]") && message.includes("Req #100")));
  assert.ok(heartbeats.some((message) => message.includes("[B]") && message.includes("Req #100")));
});

test("number rollcalls notify each account once without number API or PUT calls", async () => {
  const { notifications, requests } = await autosignHarness({ rollcalls: [{
    rollcall_id: 42, is_number: true, status: "unanswered", title: "Number sign-in",
    course_title: "Test course", created_by_name: "Teacher", department_name: "Test",
  }] }, 2);
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.method === "GET" && request.url.endsWith("/api/radar/rollcalls")));
  const notices = notifications.filter((message) => /new number rollcall #42/i.test(message));
  assert.equal(notices.length, 2);
  assert.ok(notices.some((message) => message.includes("[A]")));
  assert.ok(notices.some((message) => message.includes("[B]")));
});

test("reliable todos select semesters by Shanghai date and filter optional material", async () => {
  const instant = "2026-10-27T16:30:00Z";
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return Date.parse(instant); }
  }
  let selectedSemesters;
  const active = { published: true, start_time: "2026-10-01T00:00:00+08:00", end_time: "2026-10-31T23:59:59+08:00" };
  class COURSES {
    async fetch(rawUrl) {
      const url = new URL(rawUrl);
      let data;
      if (url.pathname === "/api/my-semesters") data = { semesters: [
        { id: 28, start_date: "2026-10-28", end_date: "2026-10-28" },
        { id: 27, start_date: "2026-10-01", end_date: "2026-10-27", is_active: true },
      ] };
      else if (url.pathname === "/api/my-courses") {
        selectedSemesters = JSON.parse(url.searchParams.get("conditions")).semester_id;
        data = { courses: [{ id: 1, name: "Test course" }, { id: 1, name: "Test course" }] };
      } else if (url.pathname.endsWith("/activities")) data = { activities: [
        { ...active, id: 1, title: "Optional material", type: "material", completion_criterion_key: "none" },
        { ...active, id: 2, title: "Required material", type: "material", completion_criterion_key: "view" },
        { ...active, id: 3, title: "Submitted homework", type: "homework" },
        { ...active, id: 4, title: "Future homework", type: "homework", start_time: "2026-10-29T00:00:00+08:00" },
      ] };
      else if (url.pathname.endsWith("/exams")) data = { exams: [
        { ...active, id: 5, title: "Submitted exam" }, { ...active, id: 6, title: "Pending exam" },
      ] };
      else if (url.pathname.includes("/homework/submission-status")) data = { homework_activities: [{ id: 3, status_code: "submitted" }] };
      else if (url.pathname.endsWith("/submitted-exams")) data = { exam_ids: [5] };
      else if (url.pathname.endsWith("/classroom-list")) data = { classrooms: [{ id: 7, title: "Live interaction", status: "start" }] };
      else assert.fail(`unexpected URL ${url}`);
      return { json: async () => data };
    }
  }
  const { namespace } = await loadScript("courses.zju/reliableTodolist.js", {
    entrypoint: "// 主流程", exports: ["getActiveSemesterIds", "getCoursesZjuTodos"],
    globals: { Date: FixedDate },
    mocks: { "login-zju": { COURSES, ZJUAM: class {} }, axios: { default: {} }, "dotenv/config": {}, "../shared/config.js": {} },
  });
  const todos = await namespace.getCoursesZjuTodos();
  assert.deepEqual(selectedSemesters, [28]);
  assert.deepEqual(plain(todos).map((todo) => todo.id), [2, 6, 7]);
  assert.deepEqual(plain(namespace.getActiveSemesterIds([{ id: 1, start_date: "2026-10-28", end_date: "2026-10-28" }], new Date(instant))), [1]);
  assert.throws(() => namespace.getActiveSemesterIds([{ id: 2 }]), /缺少起止日期/);
});

test("grade notifications retain saved state on failure and retry the change", async () => {
  const files = new Map();
  const statePath = "/memory/grades.json";
  let currentScore = "80";
  let deliveryFailure = false;
  let deliveries = 0;
  const memoryFs = {
    existsSync: (filename) => files.has(filename), readFileSync: (filename) => files.get(filename),
    mkdirSync() {}, writeFileSync: (filename, value) => files.set(filename, value),
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); },
  };
  const { namespace } = await loadScript("zdbk.zju/gradeMonitor.js", {
    entrypoint: "main()\n", exports: ["buildConfig", "runCheck"],
    process: { env: { ZJU_USERNAME: "dummy", ZJU_PASSWORD: "fake", GRADE_CHECK_EVALUATION: "false", GRADE_STATE_PATH: statePath } },
    mocks: {
      "dotenv/config": {}, "../shared/config.js": {}, "node:fs": { default: memoryFs },
      "login-zju": { ZJUAM: class {}, ZDBK: class {
        async fetch() { return { ok: true, json: async () => ({ items: [{ xkkh: "course-1", kcmc: "Test course", cj: currentScore, bkcj: "", jd: "3.5", xf: "2" }] }) }; }
      } },
      "../shared/dingtalk-webhook.js": { dingTalkMarkdown: async () => {
        deliveries++;
        if (deliveryFailure) throw new Error("mock delivery failed");
        return { sent: true };
      } },
    },
  });
  const config = namespace.buildConfig();
  assert.equal(await namespace.runCheck(config), 0);
  assert.equal(deliveries, 0);
  const baseline = files.get(statePath);
  assert.equal(JSON.parse(baseline).scores["course-1"].cj, "80");
  currentScore = "90";
  deliveryFailure = true;
  await assert.rejects(namespace.runCheck(config), /mock delivery failed/);
  assert.equal(files.get(statePath), baseline);
  deliveryFailure = false;
  assert.equal(await namespace.runCheck(config), 1);
  assert.equal(JSON.parse(files.get(statePath)).scores["course-1"].cj, "90");
  assert.equal(deliveries, 2);
});

test("CLI forwards grade commands and the selected ALT script", async () => {
  let selection = "grade-monitor-check";
  const children = [];
  const { namespace } = await loadScript("shared/cli-entry.js", {
    entrypoint: "main().catch(", exports: ["main"],
    mocks: {
      inquirer: { default: { prompt: async () => ({ selectedScript: selection }) } },
      child_process: { fork: (filename, args, options) => { children.push({ filename, args: plain(args), options }); return { on() {} }; } },
      fs: { default: {} },
    },
  });
  await namespace.main();
  selection = "grade-monitor-monitor";
  await namespace.main();
  selection = "alt.zju/autojudge.js";
  await namespace.main();
  assert.deepEqual(children.map(({ filename, args }) => ({ filename, args })), [
    { filename: path.join(root, "zdbk.zju/gradeMonitor.js"), args: ["check"] },
    { filename: path.join(root, "zdbk.zju/gradeMonitor.js"), args: ["monitor"] },
    { filename: path.join(root, "alt.zju/autojudge.js"), args: [] },
  ]);
  assert.ok(children.every((child) => child.options.cwd === root && child.options.stdio === "inherit"));
});

for (const [relative, entrypoint] of [
  ["alt.zju/autojudge.js", "main();"],
  ["zdbk.zju/gradeMonitor.js", "main()\n"],
]) {
  test(`${relative} loads credentials through the shared --env configuration`, async () => {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /import ["']\.\.\/shared\/config\.js["']/);
    const envPath = path.join(root, ".env.integration-test");
    const configLoads = [];
    const fakeEnv = {};
    let constructedCredentials;
    const { namespace } = await loadScript(relative, {
      entrypoint, exports: relative.startsWith("zdbk") ? ["buildConfig"] : [],
      process: { env: fakeEnv, argv: ["node", relative, "--env", ".env.integration-test"] },
      mocks: {
        dotenv: { default: { config({ path: filename }) {
          configLoads.push(filename);
          Object.assign(fakeEnv, { ZJU_USERNAME: "configured-user", ZJU_PASSWORD: "configured-secret" });
        } } },
        fs: { default: { existsSync: (filename) => filename === envPath } },
        "node:fs": { default: {} },
        chalk: { default: {} }, inquirer: { default: {} },
        "login-zju": {
          ZJUAM: class { constructor(username, password) { constructedCredentials = { username, password }; } },
          ALT: class {}, ZDBK: class {},
        },
        "../shared/dingtalk-webhook.js": { dingTalkMarkdown: async () => ({ sent: false }) },
      },
    });
    assert.deepEqual(configLoads, [envPath]);
    const credentials = relative.startsWith("zdbk") ? namespace.buildConfig() : constructedCredentials;
    assert.equal(credentials.username, "configured-user");
    assert.equal(credentials.password, "configured-secret");
  });
}


test("ALT mock workflow stops after an empty pending-course list", async () => {
  const requests = [];
  const color = (value) => value;
  const { namespace, output } = await loadScript("alt.zju/autojudge.js", {
    entrypoint: "main();", exports: ["main"],
    mocks: {
      "../shared/config.js": {},
      chalk: { default: { red: color, blue: color, bold: color } },
      inquirer: { default: { prompt: async () => ({ mode: "interactive" }) } },
      "login-zju": {
        ZJUAM: class {},
        ALT: class {
          async fetch(url, options) {
            requests.push({ url, method: options.method, body: JSON.parse(options.body) });
            assert.ok(url.endsWith("/page_my_todo_plan_course_list"));
            return { json: async () => ({ data: { data: [] } }) };
          }
        },
      },
    },
  });
  await namespace.main();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].body, { pageNum: 0, pageSize: 20 });
  assert.ok(output.some((line) => line.includes("找到 0 门待评教课程")));
});
