const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

let suspendProcess, resumeProcessNative;
if (os.platform() === 'win32') {
  const { execSync } = require('child_process');
  const { getPssuspendPath } = require('./ensure-pssuspend');
  
  suspendProcess = (pid) => {
    try {
      const pssuspendPath = getPssuspendPath();
      if (!pssuspendPath) return false;
      execSync(`"${pssuspendPath}" /accepteula -nobanner ${pid}`, { stdio: 'ignore' });
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
      execSync(`"${pssuspendPath}" /accepteula -nobanner -r ${pid}`, { stdio: 'ignore' });
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
      process.kill(pid, 'SIGSTOP');
    }
  } catch (e) {
    console.error(`Failed to pause process ${pid}:`, e);
  }
}

function resumeProcess(pid) {
  try {
    if (os.platform() === 'win32' && resumeProcessNative) {
      resumeProcessNative(pid);
    } else {
      process.kill(pid, 'SIGCONT');
    }
  } catch (e) {
    console.error(`Failed to resume process ${pid}:`, e);
  }
}

function killProcess(pid) {
  try {
    if (os.platform() === 'win32') {
      const { execSync } = require('child_process');
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL'); // kill process group
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
