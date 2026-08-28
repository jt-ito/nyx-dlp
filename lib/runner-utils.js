const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');

let suspendProcess, resumeProcessNative;
if (os.platform() === 'win32') {
  const { getPssuspendPath } = require('./ensure-pssuspend');
  
  suspendProcess = (pid) => {
    try {
      const pssuspendPath = getPssuspendPath();
      if (!pssuspendPath) return false;
      execFile(pssuspendPath, ['/accepteula', '-nobanner', String(pid)], () => {});
      return true;
    } catch (e) {
      console.error('Failed to suspend process via pssuspend', e);
      return false;
    }
  };
  
  resumeProcessNative = (pid) => {
    try {
      const pssuspendPath = getPssuspendPath();
      if (!pssuspendPath) return false;
      execFile(pssuspendPath, ['/accepteula', '-nobanner', '-r', String(pid)], () => {});
      return true;
    } catch (e) {
      console.error('Failed to resume process via pssuspend', e);
      return false;
    }
  };
}

function pauseProcess(pid) {
  try {
    if (os.platform() === 'win32' && suspendProcess) {
      suspendProcess(pid);
    } else {
      process.kill(-pid, 'SIGSTOP'); // pause process group
    }
  } catch (e) {
    try {
      process.kill(pid, 'SIGSTOP');
    } catch (e2) {}
    console.error(`Failed to pause process ${pid}:`, e);
  }
}

function resumeProcess(pid) {
  try {
    if (os.platform() === 'win32' && resumeProcessNative) {
      resumeProcessNative(pid);
    } else {
      process.kill(-pid, 'SIGCONT'); // resume process group
    }
  } catch (e) {
    try {
      process.kill(pid, 'SIGCONT');
    } catch (e2) {}
    console.error(`Failed to resume process ${pid}:`, e);
  }
}

function killProcess(pid) {
  if (!pid) return;
  try {
    if (os.platform() === 'win32') {
      // Use native taskkill with /T (terminate entire tree) and /F (force) asynchronously
      execFile('taskkill', ['/F', '/T', '/PID', String(pid)], () => {});
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
    } else {
      try {
        process.kill(-pid, 'SIGKILL'); // kill process group
      } catch (_) {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch (e) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e2) {}
  }
}

module.exports = {
  pauseProcess,
  resumeProcess,
  killProcess
};
