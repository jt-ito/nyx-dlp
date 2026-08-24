const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

let suspendProcess, resumeProcessNative;
if (os.platform() === 'win32') {
  const { execSync } = require('child_process');
  const { getPssuspendPath } = require('./ensure-pssuspend');
  
  function getDescendents(pid) {
    let output = '';
    try {
      output = execSync('wmic process get ParentProcessId,ProcessId', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      try {
        output = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ParentProcessId,ProcessId"', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (e2) {
        return [];
      }
    }

    const lines = output.split('\n').map(l => l.trim()).filter(l => l);
    const parentMap = new Map();
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 2) {
        const ppid = parseInt(parts[0], 10);
        const cpid = parseInt(parts[1], 10);
        if (!parentMap.has(ppid)) parentMap.set(ppid, []);
        parentMap.get(ppid).push(cpid);
      }
    }

    const descendents = [];
    const stack = [parseInt(pid, 10)];
    while (stack.length > 0) {
      const current = stack.pop();
      if (parentMap.has(current)) {
        const children = parentMap.get(current);
        descendents.push(...children);
        stack.push(...children);
      }
    }
    return descendents;
  }

  suspendProcess = (pid) => {
    try {
      const pssuspendPath = getPssuspendPath();
      if (!pssuspendPath) return false;
      const allPids = [pid, ...getDescendents(pid)];
      for (const p of allPids) {
        try { execSync(`"${pssuspendPath}" /accepteula -nobanner ${p}`, { stdio: 'ignore' }); } catch (e) {}
      }
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
      const allPids = [pid, ...getDescendents(pid)];
      for (const p of allPids) {
        try { execSync(`"${pssuspendPath}" /accepteula -nobanner -r ${p}`, { stdio: 'ignore' }); } catch (e) {}
      }
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
      const { execSync } = require('child_process');
      let allPids = [pid];
      try {
        if (typeof getDescendents === 'function') {
          allPids = [pid, ...getDescendents(pid)];
        }
      } catch (_) {}
      
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } catch (_) {}

      for (const p of allPids) {
        try {
          execSync(`taskkill /F /PID ${p}`, { stdio: 'ignore' });
        } catch (_) {}
      }
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
