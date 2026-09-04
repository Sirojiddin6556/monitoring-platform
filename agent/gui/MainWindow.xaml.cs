using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Threading;

namespace AgentGui;

public partial class MainWindow : Window
{
    // ── Palette for log colouring ─────────────────────────────────
    static readonly SolidColorBrush ClrFg      = new(Color.FromRgb(0xC8, 0xD1, 0xDC));
    static readonly SolidColorBrush ClrFg2     = new(Color.FromRgb(0x9A, 0xA4, 0xB2));
    static readonly SolidColorBrush ClrGreen   = new(Color.FromRgb(0x4A, 0xDE, 0x80));
    static readonly SolidColorBrush ClrRed     = new(Color.FromRgb(0xEF, 0x44, 0x44));
    static readonly SolidColorBrush ClrYellow  = new(Color.FromRgb(0xFA, 0xCC, 0x15));
    static readonly SolidColorBrush ClrAccent  = new(Color.FromRgb(0x6C, 0x5C, 0xE7));

    // ── Paths ─────────────────────────────────────────────────────
    static readonly string AgentDir  = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, ".."));   // gui/ lives inside agent/
    static readonly string AgentExe  = Path.Combine(AgentDir, "MonitoringAgent.exe");
    static readonly string EnvFile   = Path.Combine(AgentDir, "agent.env");
    static readonly string PauseFile = Path.Combine(AgentDir, ".agent_paused");
    static readonly string HbFile    = Path.Combine(AgentDir, "agent_heartbeat.json");
    static readonly string VerFile   = Path.Combine(AgentDir, "VERSION");

    // ── Agent process ─────────────────────────────────────────────
    Process? _agentProcess;

    // ── Timers ────────────────────────────────────────────────────
    readonly DispatcherTimer _uiTimer  = new() { Interval = TimeSpan.FromSeconds(2) };
    readonly DispatcherTimer _hbTimer  = new() { Interval = TimeSpan.FromSeconds(5) };

    // ── Win32 memory API ─────────────────────────────────────────
    [StructLayout(LayoutKind.Sequential)]
    struct MEMORYSTATUSEX
    {
        public uint  dwLength;
        public uint  dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }
    [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    static (double usedGb, double totalGb, double pct) GetRam()
    {
        var ms = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (!GlobalMemoryStatusEx(ref ms)) return (0, 0, 0);
        double total = ms.ullTotalPhys;
        double avail = ms.ullAvailPhys;
        double used  = total - avail;
        return (used / 1_073_741_824.0, total / 1_073_741_824.0, ms.dwMemoryLoad);
    }

    // ── Perf counters ─────────────────────────────────────────────
    PerformanceCounter? _cpuCounter;
    float _cpuVal;
    string _lastSent = "—";
    int    _logLines;

    public MainWindow()
    {
        InitializeComponent();

        InitPerfCounters();
        LoadEnv();
        UpdateTitle();
        CheckForRunningAgent();

        _uiTimer.Tick  += UiTimer_Tick;
        _hbTimer.Tick  += HbTimer_Tick;
        _uiTimer.Start();
        _hbTimer.Start();

        Closed += (_, _) =>
        {
            _uiTimer.Stop();
            _hbTimer.Stop();
            _cpuCounter?.Dispose();
        };
    }

    // ── Init ──────────────────────────────────────────────────────

    void InitPerfCounters()
    {
        try { _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total"); }
        catch { /* perf counters unavailable — will use WMI fallback */ }
    }

    void LoadEnv()
    {
        var env = ReadEnv();
        CfgBackend.Text   = env.GetValueOrDefault("BACKEND_URL",  "http://127.0.0.1:8000");
        CfgServerId.Text  = env.GetValueOrDefault("SERVER_ID",    "srv-local");
        CfgInterval.Text  = env.GetValueOrDefault("INTERVAL",     "15");
        CfgApiKey.Text    = env.GetValueOrDefault("INGEST_API_KEY", "");

        InfoBackend.Text   = CfgBackend.Text;
        InfoServerId.Text  = CfgServerId.Text;
        InfoInterval.Text  = CfgInterval.Text + "с";
        InfoVersion.Text   = ReadVersion();
    }

    void UpdateTitle()
    {
        Title = $"Monitoring Agent — {CfgServerId.Text}";
    }

    void CheckForRunningAgent()
    {
        var running = FindRunningAgent();
        SetRunning(running != null, running?.Id ?? 0);
    }

    // ── Timer callbacks ───────────────────────────────────────────

    void UiTimer_Tick(object? sender, EventArgs e)
    {
        RefreshMetrics();

        // Keep running state in sync if user kills process externally
        if (_agentProcess is not null && _agentProcess.HasExited)
        {
            _agentProcess = null;
            SetRunning(false, 0);
        }

        var running = FindRunningAgent();
        if (_agentProcess is null && running is not null)
        {
            _agentProcess = running;
            SetRunning(true, running.Id);
        }

        BottomInfo.Text = $"server_id: {CfgServerId.Text}  |  interval: {CfgInterval.Text}s";
    }

    void HbTimer_Tick(object? sender, EventArgs e)
    {
        // Parse heartbeat JSON for last-sent timestamp
        try
        {
            if (!File.Exists(HbFile)) return;
            var json = File.ReadAllText(HbFile);
            var m = Regex.Match(json, @"""ts""\s*:\s*(\d+)");
            if (m.Success && long.TryParse(m.Groups[1].Value, out var ts))
            {
                var dt = DateTimeOffset.FromUnixTimeSeconds(ts).LocalDateTime;
                _lastSent = dt.ToString("HH:mm:ss");
                InfoLastSent.Text = _lastSent;
            }
        }
        catch { /* ignore */ }
    }

    // ── Metrics ───────────────────────────────────────────────────

    void RefreshMetrics()
    {
        // CPU
        try
        {
            if (_cpuCounter is not null)
                _cpuVal = _cpuCounter.NextValue();
        }
        catch { }

        CpuVal.Text  = $"{_cpuVal:F0}";
        CpuBar.Value = _cpuVal;

        // RAM
        var (usedGb, totalGb, ramPct) = GetRam();
        RamVal.Text    = $"{ramPct:F0}";
        RamBar.Value   = ramPct;
        RamDetail.Text = $"{usedGb:F1} GB / {totalGb:F1} GB";

        // Disk (max % across all fixed drives)
        try
        {
            double maxPct = 0;
            foreach (var d in DriveInfo.GetDrives())
            {
                if (d.DriveType != DriveType.Fixed || !d.IsReady) continue;
                double pct = (1.0 - (double)d.AvailableFreeSpace / d.TotalSize) * 100;
                if (pct > maxPct) maxPct = pct;
            }
            DiskVal.Text  = $"{maxPct:F0}";
            DiskBar.Value = maxPct;
        }
        catch { }
    }

    // ── Agent control ─────────────────────────────────────────────

    void StartAgent_Click(object sender, RoutedEventArgs e)
    {
        // Remove pause flag
        try { if (File.Exists(PauseFile)) File.Delete(PauseFile); } catch { }

        if (!File.Exists(AgentExe))
        {
            MessageBox.Show($"MonitoringAgent.exe не найден:\n{AgentExe}",
                            "Ошибка", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var existing = FindRunningAgent();
        if (existing is not null)
        {
            _agentProcess = existing;
            SetRunning(true, existing.Id);
            return;
        }

        var env = BuildEnvDict();
        var psi = new ProcessStartInfo(AgentExe)
        {
            WorkingDirectory        = AgentDir,
            UseShellExecute         = false,
            CreateNoWindow          = true,
            RedirectStandardOutput  = true,
            RedirectStandardError   = true,
            StandardOutputEncoding  = System.Text.Encoding.UTF8,
            StandardErrorEncoding   = System.Text.Encoding.UTF8,
        };
        foreach (var (k, v) in env)
        {
            psi.Environment[k] = v;
        }
        psi.Environment["AGENT_FORCE_START"] = "1";

        _agentProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _agentProcess.OutputDataReceived += (_, a) => { if (a.Data != null) AppendLog(a.Data); };
        _agentProcess.ErrorDataReceived  += (_, a) => { if (a.Data != null) AppendLog(a.Data); };
        _agentProcess.Exited             += (_, _) => Dispatcher.Invoke(() =>
        {
            AppendLog("[gui] agent process exited");
            SetRunning(false, 0);
        });

        _agentProcess.Start();
        _agentProcess.BeginOutputReadLine();
        _agentProcess.BeginErrorReadLine();

        AppendLog($"[gui] started MonitoringAgent.exe (PID {_agentProcess.Id})");
        SetRunning(true, _agentProcess.Id);
    }

    void StopAgent_Click(object sender, RoutedEventArgs e)
    {
        // Write pause flag so Task Scheduler instance also stops
        try { File.WriteAllText(PauseFile, "paused"); } catch { }

        var pids = FindAllAgentPids();
        foreach (var pid in pids)
        {
            try { Process.GetProcessById(pid).Kill(entireProcessTree: true); }
            catch { }
        }

        if (_agentProcess is not null && !_agentProcess.HasExited)
        {
            try { _agentProcess.Kill(true); } catch { }
        }

        _agentProcess = null;
        AppendLog("[gui] agent stopped");
        SetRunning(false, 0);
    }

    void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(CfgInterval.Text.Trim(), out int iv) || iv < 1)
        {
            MessageBox.Show("Интервал должен быть целым числом ≥ 1", "Ошибка",
                            MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var lines = new[]
        {
            $"BACKEND_URL={CfgBackend.Text.Trim().TrimEnd('/')}",
            $"SERVER_ID={CfgServerId.Text.Trim()}",
            $"INTERVAL={iv}",
            $"INGEST_API_KEY={CfgApiKey.Text.Trim()}",
        };
        File.WriteAllLines(EnvFile, lines);

        InfoBackend.Text  = CfgBackend.Text.Trim();
        InfoServerId.Text = CfgServerId.Text.Trim();
        InfoInterval.Text = $"{iv}с";
        UpdateTitle();

        SaveHint.Text = $"Сохранено в {EnvFile}";

        // Restart agent if running
        bool wasRunning = _agentProcess is not null && !_agentProcess.HasExited;
        if (wasRunning)
        {
            StopAgent_Click(sender, e);
            System.Threading.Thread.Sleep(600);
            StartAgent_Click(sender, e);
        }
    }

    void ClearLogs_Click(object sender, RoutedEventArgs e)
    {
        LogBox.Document.Blocks.Clear();
        _logLines = 0;
        LogCountLabel.Text = "";
    }

    // ── Log append ────────────────────────────────────────────────

    void AppendLog(string line)
    {
        Dispatcher.InvokeAsync(() =>
        {
            var para = new Paragraph(new Run(line))
            {
                Margin = new Thickness(0),
                Foreground = ClassifyLine(line),
            };
            LogBox.Document.Blocks.Add(para);

            // Trim to last 2000 lines
            _logLines++;
            if (_logLines > 2000)
            {
                LogBox.Document.Blocks.Remove(LogBox.Document.Blocks.FirstBlock);
                _logLines--;
            }

            LogCountLabel.Text = $"{_logLines} строк";

            if (AutoScroll.IsChecked == true)
                LogBox.ScrollToEnd();

            // Update last-sent from log line
            if (line.Contains("] sent "))
                InfoLastSent.Text = DateTime.Now.ToString("HH:mm:ss");
        });
    }

    static SolidColorBrush ClassifyLine(string line)
    {
        var u = line.ToUpperInvariant();
        if (u.Contains("ERROR"))   return ClrRed;
        if (u.Contains("WARNING") || u.Contains("WARN")) return ClrYellow;
        if (u.Contains("DEBUG"))   return ClrFg2;
        return ClrFg;
    }

    // ── State helpers ─────────────────────────────────────────────

    void SetRunning(bool running, int pid)
    {
        if (running)
        {
            StatusDot.Fill    = ClrGreen;
            StatusLabel.Text  = "Работает";
            BtnStart.IsEnabled = false;
            BtnStop.IsEnabled  = true;
            InfoPid.Text       = pid.ToString();
        }
        else
        {
            StatusDot.Fill    = ClrRed;
            StatusLabel.Text  = "Остановлен";
            BtnStart.IsEnabled = true;
            BtnStop.IsEnabled  = false;
            InfoPid.Text       = "—";
        }
    }

    static Process? FindRunningAgent()
    {
        try
        {
            return Process.GetProcessesByName("MonitoringAgent")
                          .FirstOrDefault(p => !p.HasExited);
        }
        catch { return null; }
    }

    static List<int> FindAllAgentPids()
    {
        var result = new List<int>();
        try
        {
            foreach (var p in Process.GetProcessesByName("MonitoringAgent"))
                if (!p.HasExited) result.Add(p.Id);
        }
        catch { }
        return result;
    }

    // ── Config helpers ────────────────────────────────────────────

    static Dictionary<string, string> ReadEnv()
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(EnvFile)) return dict;
        foreach (var line in File.ReadAllLines(EnvFile))
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#')) continue;
            var idx = line.IndexOf('=');
            if (idx < 1) continue;
            dict[line[..idx].Trim()] = line[(idx + 1)..].Trim();
        }
        return dict;
    }

    Dictionary<string, string> BuildEnvDict() => new()
    {
        ["BACKEND_URL"]    = CfgBackend.Text.Trim().TrimEnd('/'),
        ["SERVER_ID"]      = CfgServerId.Text.Trim(),
        ["INTERVAL"]       = CfgInterval.Text.Trim(),
        ["INGEST_API_KEY"] = CfgApiKey.Text.Trim(),
    };

    static string ReadVersion()
    {
        try { return File.ReadAllText(VerFile).Trim(); }
        catch { return "—"; }
    }
}
