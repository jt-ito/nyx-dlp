const { spawn, execFile, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

let suspendProcess, resumeProcessNative;
let getExe = () => null;

if (os.platform() === 'win32') {
  const { getTreespendPath, ensureTreespend } = require('./ensure-treespend');
  const fs = require('fs');

  getExe = () => {
    const exe = getTreespendPath();
    if (exe && fs.existsSync(exe)) return exe;
    ensureTreespend();
    return (exe && fs.existsSync(exe)) ? exe : null;
  };

  const ntTreeScript = (action, rootPid) => `
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class TreeProc {
    [DllImport("ntdll.dll", SetLastError = true)] public static extern uint NtSuspendProcess(IntPtr h);
    [DllImport("ntdll.dll", SetLastError = true)] public static extern uint NtResumeProcess(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint a, bool b, int p);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);
    [DllImport("kernel32.dll")]
    public static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
    [DllImport("kernel32.dll")]
    public static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESSENTRY32 {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    public static List<int> GetTree(int parentId) {
        var result = new List<int> { parentId };
        var snapshot = CreateToolhelp32Snapshot(0x00000002, 0);
        if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1)) return result;
        var pe = new PROCESSENTRY32();
        pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
        var children = new Dictionary<int, List<int>>();
        if (Process32First(snapshot, ref pe)) {
            do {
                int ppid = (int)pe.th32ParentProcessID;
                int pid = (int)pe.th32ProcessID;
                if (!children.ContainsKey(ppid)) children[ppid] = new List<int>();
                children[ppid].Add(pid);
            } while (Process32Next(snapshot, ref pe));
        }
        CloseHandle(snapshot);

        var queue = new Queue<int>();
        queue.Enqueue(parentId);
        while (queue.Count > 0) {
            int cur = queue.Dequeue();
            if (children.ContainsKey(cur)) {
                foreach (int c in children[cur]) {
                    if (!result.Contains(c)) {
                        result.Add(c);
                        queue.Enqueue(c);
                    }
                }
            }
        }
        return result;
    }

    public static void Execute(string action, int rootPid) {
        var pids = GetTree(rootPid);
        foreach (var pid in pids) {
            IntPtr h = OpenProcess(0x1F0FFF, false, pid);
            if (h != IntPtr.Zero) {
                if (action == "suspend") NtSuspendProcess(h);
                else if (action == "resume") NtResumeProcess(h);
                CloseHandle(h);
            }
        }
    }
}
'@
[TreeProc]::Execute("${action}", ${rootPid})
`;

  suspendProcess = (pid) => {
    try {
      const exe = getExe();
      if (exe) {
        spawnSync(exe, ['suspend', String(pid)], { stdio: 'ignore', timeout: 3000 });
        return true;
      }
      spawnSync('powershell', ['-NoProfile', '-Command', ntTreeScript('suspend', pid)], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch (e) {
      console.error('Failed to suspend process', e);
      return false;
    }
  };

  resumeProcessNative = (pid) => {
    try {
      const exe = getExe();
      if (exe) {
        spawnSync(exe, ['resume', String(pid)], { stdio: 'ignore', timeout: 3000 });
        return true;
      }
      spawnSync('powershell', ['-NoProfile', '-Command', ntTreeScript('resume', pid)], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch (e) {
      console.error('Failed to resume process', e);
      return false;
    }
  };
}

function pauseProcess(pid) {
  if (!pid) return;
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
  if (!pid) return;
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
      const exe = getExe();
      if (exe) {
        try {
          spawnSync(exe, ['kill', String(pid)], { stdio: 'ignore', timeout: 3000 });
        } catch (_) {}
      }
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', timeout: 3000 });
      } catch (_) {}
      try { execFile('taskkill', ['/F', '/T', '/PID', String(pid)], () => {}); } catch (_) {}
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
