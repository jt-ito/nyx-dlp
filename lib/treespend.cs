using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class TreeSpend {
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

    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    public static void Main(string[] args) {
        if (args.Length < 2) return;
        string action = args[0].ToLowerInvariant();
        int rootPid;
        if (!int.TryParse(args[1], out rootPid) || rootPid <= 0) return;

        var pids = GetTree(rootPid);
        // If killing, process leaves first (reverse order) so children are killed before parent exits
        if (action == "kill" || action == "stop" || action == "term") {
            pids.Reverse();
        }
        foreach (var pid in pids) {
            IntPtr h = OpenProcess(0x1F0FFF, false, pid);
            if (h != IntPtr.Zero) {
                if (action == "suspend") {
                    NtSuspendProcess(h);
                } else if (action == "resume") {
                    NtResumeProcess(h);
                } else if (action == "kill" || action == "stop" || action == "term") {
                    NtResumeProcess(h);
                    TerminateProcess(h, 1);
                }
                CloseHandle(h);
            }
        }
    }
}
