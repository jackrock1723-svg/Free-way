import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Respect an explicit interpreter override, but choose a command that exists on the current OS by default.
const python = process.env.FC_PYTHON_EXE || (process.platform === 'win32' ? 'python.exe' : 'python3');
const playwrightCli = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const providerEnvNames = [
  'OPENROUTER_API_KEY',
  'NVIDIA_API_KEY',
  'GROQ_API_KEY',
  'GITHUB_MODELS_TOKEN',
  'MISTRAL_API_KEY',
  'CLOUDFLARE_AI_KEY',
  'FREECODE_TOKEN',
];
const testEnv = { ...process.env };
for (const name of providerEnvNames) delete testEnv[name];
testEnv.FC_GOOGLE_AUTH = 'off';
testEnv.FC_MCP = '0';
testEnv.FC_ADS = 'off';
testEnv.PYTHONDONTWRITEBYTECODE = '1';
testEnv.PYTHONPATH = [repoRoot, testEnv.PYTHONPATH].filter(Boolean).join(path.delimiter);

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timed out waiting for the loopback test server'));
      }
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const match = buffer.match(/FC_TEST_SERVER_URL=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Test server exited before startup (code ${code})`));
      }
    });
  });
}

function runPlaywright(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
      cwd: repoRoot,
      env: { ...testEnv, FC_TEST_BASE_URL: baseUrl },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

const server = spawn(python, ['-m', 'tests.python.server_fixture'], {
  cwd: repoRoot,
  env: testEnv,
  stdio: ['pipe', 'pipe', 'pipe'],
});
let result = 1;
try {
  const baseUrl = await waitForServer(server);
  result = await runPlaywright(baseUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.stdin.end('stop\n');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null && server.signalCode === null) server.kill();
        resolve();
      }, 5_000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
process.exitCode = result;
