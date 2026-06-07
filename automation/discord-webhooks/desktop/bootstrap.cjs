const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const electron = require('electron');

function getCrashLogPath() {
  const baseDir = electron.app && electron.app.isPackaged
    ? path.dirname(process.execPath)
    : path.resolve(__dirname, '../../..');

  return path.join(baseDir, 'main-process-crash.log');
}

function formatErrorDetails(error) {
  if (!error) {
    return 'Unknown startup error';
  }

  if (error.stack) {
    return error.stack;
  }

  return String(error);
}

function writeCrashLog(label, error) {
  const details = formatErrorDetails(error);
  const body = [
    `[${new Date().toISOString()}] ${label}`,
    `execPath: ${process.execPath}`,
    `cwd: ${process.cwd()}`,
    `argv: ${JSON.stringify(process.argv)}`,
    details,
    ''
  ].join('\n');

  try {
    fs.appendFileSync(getCrashLogPath(), body, 'utf8');
  } catch {
    // Ignore crash-log write failures and still surface the startup error.
  }

  return details;
}

function showStartupError(title, details) {
  try {
    electron.dialog.showErrorBox(title, `${details}\n\nCrash log: ${getCrashLogPath()}`);
  } catch {
    // Ignore UI reporting failures when Electron is not fully ready.
  }
}

process.on('uncaughtException', (error) => {
  const details = writeCrashLog('uncaughtException', error);
  showStartupError('Tipping Bot Startup Error', details);
});

process.on('unhandledRejection', (reason) => {
  const details = writeCrashLog('unhandledRejection', reason);
  showStartupError('Tipping Bot Startup Error', details);
});

(async () => {
  try {
    const entryFile = pathToFileURL(path.join(__dirname, 'main.mjs')).href;

    await electron.app.whenReady();
    // Standard dynamic import for Windows safety
    await import(entryFile);
  } catch (error) {
    const details = writeCrashLog('bootstrap import failure', error);
    showStartupError('Tipping Bot Startup Error', details);
    process.exit(1);
  }
})();