const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

let suspendProcess, resumeProcessNative;
if (os.platform() === 'win32') {
  try {
    const koffi = require('koffi');
    const ntdll = koffi.load('ntdll.dll');
    const NtSuspendProcess = ntdll.func('int __stdcall NtSuspendProcess(void *ProcessHandle)');
    const NtResumeProcess = ntdll.func('int __stdcall NtResumeProcess(void *ProcessHandle)');
    
    const kernel32 = koffi.load('kernel32.dll');
    // PROCESS_SUSPEND_RESUME = 0x0800
    const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)');
    const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *hObject)');
    
    suspendProcess = (pid) => {
      const handle = OpenProcess(0x0800, 0, pid);
      if (handle) {
        NtSuspendProcess(handle);
        CloseHandle(handle);
        return true;
      }
      return false;
    };
    
    resumeProcessNative = (pid) => {
      const handle = OpenProcess(0x0800, 0, pid);
      if (handle) {
        NtResumeProcess(handle);
        CloseHandle(handle);
        return true;
      }
      return false;
    };
  } catch (e) {
    console.error('Failed to init FFI for suspend/resume', e);
  }
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
