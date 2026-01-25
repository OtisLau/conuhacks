// client/engine-bridge.js
// Node.js module to call Python engine via subprocess

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.join(__dirname, '..');
const VENV_PYTHON = path.join(PROJECT_ROOT, 'engine', '.venv', 'bin', 'python3');

function runEngineCommand(command, args) {
  return new Promise((resolve, reject) => {
    // Use the venv Python to ensure dependencies are available
    const proc = spawn(VENV_PYTHON, ['-m', 'engine.cli', command, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: PROJECT_ROOT }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      // Allow non-zero exit codes if we got valid JSON output (e.g., locate returns 1 when not found)
      if (code !== 0 && !stdout.includes('"found"') && !stdout.includes('"steps"')) {
        reject(new Error(`Engine error (code ${code}): ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn engine process: ${err.message}`));
    });
  });
}

async function takeScreenshot() {
  const tmpPath = path.join(os.tmpdir(), `conu_screenshot_${Date.now()}.png`);
  await runEngineCommand('screenshot', ['--output', tmpPath]);
  return tmpPath;
}

async function generatePlan(screenshotPath, task) {
  const output = await runEngineCommand('plan', [screenshotPath, task, '--json']);
  // Look for JSON block in output (after "JSON:" marker)
  const jsonMatch = output.match(/JSON:\s*(\{[\s\S]*\})/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  throw new Error('Could not parse plan JSON from output');
}

async function locateElement(screenshotPath, target, region = 'full', isIcon = false, instruction = '', quad = null, fast = true) {
  const args = [screenshotPath, target, '-r', region, '--json'];
  if (isIcon) args.push('-i');
  if (instruction) args.push('--instruction', instruction);
  if (quad) args.push('-q', String(quad));
  if (fast) args.push('--fast');  // Skip Gemini verification for speed

  const output = await runEngineCommand('locate', args);
  // Find JSON in output (may have other text before it)
  const lines = output.trim().split('\n');
  for (const line of lines) {
    if (line.startsWith('{')) {
      return JSON.parse(line);
    }
  }
  throw new Error('Could not parse locate JSON from output');
}

module.exports = { takeScreenshot, generatePlan, locateElement, runEngineCommand };
