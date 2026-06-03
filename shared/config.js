import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultEnvFile = ".env";

function getEnvFileName() {
    const args = process.argv;
    const envIndex = args.indexOf("--env");
    if (envIndex !== -1 && envIndex + 1 < args.length) {
        return args[envIndex + 1];
    }
    return process.env.ENV_FILE || defaultEnvFile;
}

const envFile = getEnvFileName();
const envPath = path.resolve(projectRoot, envFile);
const defaultEnvPath = path.resolve(projectRoot, defaultEnvFile);

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else if (envFile !== defaultEnvFile && fs.existsSync(defaultEnvPath)) {
    console.warn(`[Config] Warning: ${envFile} not found. Falling back to ${defaultEnvFile}.`);
    dotenv.config({ path: defaultEnvPath });
} else {
    const hasRuntimeEnv = process.env.ZJU_USERNAME || process.env.ZJU_PASSWORD;
    if (!hasRuntimeEnv) {
        console.warn(`[Config] Warning: ${envFile} not found.`);
    }
}
