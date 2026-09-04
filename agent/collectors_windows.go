//go:build windows

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	psnet "github.com/shirou/gopsutil/v3/net"
)

// ── Load avg (approximated on Windows) ────────────────────────────────────────

func getLoadAvg() ([3]float64, error) {
	return [3]float64{}, fmt.Errorf("load average not supported on Windows")
}

// ── Battery (not available via gopsutil on Windows) ───────────────────────────

func getBattery() (*BatteryInfo, error) {
	return nil, nil
}

// ── Temperatures (not available on Windows via gopsutil) ──────────────────────

func collectTemperatures() []Temperature {
	return []Temperature{}
}

// ── Services ──────────────────────────────────────────────────────────────────

func collectServices() []ServiceEntry {
	out := runPS(
		`Get-Service | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json -Compress`,
		12,
	)
	if out == "" {
		return []ServiceEntry{}
	}

	var rawList []map[string]interface{}
	if err := json.Unmarshal([]byte(out), &rawList); err != nil {
		var single map[string]interface{}
		if err2 := json.Unmarshal([]byte(out), &single); err2 == nil {
			rawList = []map[string]interface{}{single}
		} else {
			return []ServiceEntry{}
		}
	}

	var services []ServiceEntry
	for _, m := range rawList {
		name, _ := m["Name"].(string)
		displayName, _ := m["DisplayName"].(string)
		if name == "" {
			continue
		}

		st := "inactive"
		if val, ok := m["Status"]; ok && val != nil {
			if num, ok := val.(float64); ok {
				if int(num) == 4 {
					st = "active"
				}
			} else if str, ok := val.(string); ok {
				strLower := strings.ToLower(str)
				if strLower == "running" || strLower == "4" {
					st = "active"
				}
			}
		}

		start := "unknown"
		if val, ok := m["StartType"]; ok && val != nil {
			if num, ok := val.(float64); ok {
				switch int(num) {
				case 2:
					start = "automatic"
				case 3:
					start = "manual"
				case 4:
					start = "disabled"
				case 5:
					start = "automatic (delayed start)"
				}
			} else if str, ok := val.(string); ok {
				strLower := strings.ToLower(strings.TrimSpace(str))
				switch strLower {
				case "automatic", "2":
					start = "automatic"
				case "manual", "3":
					start = "manual"
				case "disabled", "4":
					start = "disabled"
				case "automaticdelayedstart", "5":
					start = "automatic (delayed start)"
				}
			}
		}

		services = append(services, ServiceEntry{
			Name:        name,
			DisplayName: displayName,
			Status:      st,
			StartType:   start,
		})
	}
	return services
}

// ── Security ──────────────────────────────────────────────────────────────────

var securityWarnedOnce bool

func collectSecurity() SecurityInfo {
	conns, err := psnet.Connections("tcp")
	var openPorts []int
	activeSSH := 0
	if err == nil {
		seen := map[uint32]bool{}
		for _, c := range conns {
			if c.Status == "LISTEN" && !seen[c.Laddr.Port] {
				seen[c.Laddr.Port] = true
				openPorts = append(openPorts, int(c.Laddr.Port))
			}
			if c.Status == "ESTABLISHED" && c.Raddr.Port == 22 {
				activeSSH++
			}
		}
		sort.Ints(openPorts)
	}

	failedLogins := 0
	r := runPSRaw(
		`(Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddDays(-1)} -ErrorAction SilentlyContinue | Measure-Object).Count`,
		8,
	)
	if r != nil && r.err == nil {
		n := 0
		if _, err := fmt.Sscanf(strings.TrimSpace(r.stdout), "%d", &n); err == nil {
			failedLogins = n
		}
	} else {
		if !securityWarnedOnce {
			log.Printf("[agent] WARNING: failed_logins_24h unavailable – grant 'Event Log Readers' or run as Administrator")
			securityWarnedOnce = true
		} else {
			log.Printf("[agent] DEBUG: failed_logins query failed (warning already emitted)")
		}
	}

	// Collect active logged-in users on Windows (query user)
	activeUsers := 0
	uRes := runPS(`$u = query user 2>$null; if ($u) { ($u | Measure-Object).Count - 1 } else { 0 }`, 6)
	if uRes != "" {
		fmt.Sscanf(uRes, "%d", &activeUsers)
	}

	// Collect VPN adapters status on Windows
	activeVPNs := 0
	vRes := runPS(`$v = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and ($_.InterfaceDescription -like '*VPN*' -or $_.InterfaceDescription -like '*TAP*' -or $_.InterfaceDescription -like '*WireGuard*' -or $_.Name -like '*VPN*') } 2>$null; if ($v) { ($v | Measure-Object).Count } else { 0 }`, 6)
	if vRes != "" {
		fmt.Sscanf(vRes, "%d", &activeVPNs)
	}

	return SecurityInfo{
		OpenPorts:         openPorts,
		ActiveSSHSessions: activeSSH,
		ActiveUsers:       activeUsers,
		ActiveVPNSessions: activeVPNs,
		FailedLogins24h:   failedLogins,
	}
}

// ── Recent logs ───────────────────────────────────────────────────────────────

func collectRecentLogs() RecentLogs {
	system := queryWinEvents("System", 50)
	appErr := queryWinEvents("Application", 50)

	authSrcs := []string{
		"Security",
		"Microsoft-Windows-Winlogon/Operational",
		"Microsoft-Windows-TerminalServices-LocalSessionManager/Operational",
	}
	var authItems []string
	for _, src := range authSrcs {
		authItems = append(authItems, queryWinEvents(src, 30)...)
	}

	if len(authItems) == 0 {
		authKW := []string{"logon", "login", "sign-in", "security", "audit", "credential",
			"authentication", "failed", "denied", "ntlm", "kerberos", "4624", "4625"}
		for _, line := range append(system, appErr...) {
			ll := strings.ToLower(line)
			for _, kw := range authKW {
				if strings.Contains(ll, kw) {
					authItems = append(authItems, line)
					break
				}
			}
		}
	}

	return RecentLogs{
		System: system,
		Auth:   dedupe(authItems, 50),
		Error:  appErr,
	}
}

type psResult struct {
	stdout string
	err    error
}

func runPSRaw(script string, timeoutSec int) *psResult {
	ctx, cancel := timedContext(time.Duration(timeoutSec) * time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx,
		"powershell.exe", "-NoProfile", "-NonInteractive",
		"-ExecutionPolicy", "Bypass", "-Command", script,
	)
	cmd.SysProcAttr = hiddenSysProcAttr()
	out, err := cmd.Output()
	return &psResult{stdout: string(out), err: err}
}

func runPS(script string, timeoutSec int) string {
	r := runPSRaw(script, timeoutSec)
	if r.err != nil {
		return ""
	}
	return strings.TrimSpace(r.stdout)
}

func queryWinEvents(logName string, count int) []string {
	script := fmt.Sprintf(
		`[Console]::OutputEncoding = [Text.Encoding]::UTF8;`+
			`$OutputEncoding = [Text.Encoding]::UTF8;`+
			`$ErrorActionPreference='Stop';`+
			`$events = Get-WinEvent -LogName '%s' -MaxEvents %d `+
			`| Select-Object `+
			`@{Name='TimeCreated';Expression={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')}},`+
			`ProviderName,Id,LevelDisplayName,Message;`+
			`$json = $events | ConvertTo-Json -Compress -Depth 4;`+
			`$bytes = [System.Text.Encoding]::UTF8.GetBytes($json);`+
			`[System.Convert]::ToBase64String($bytes)`,
		logName, count,
	)
	r := runPSRaw(script, 18)
	if r == nil || r.err != nil || r.stdout == "" {
		return nil
	}
	b64 := strings.TrimSpace(r.stdout)
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil
	}

	var events []map[string]interface{}
	if err := json.Unmarshal(decoded, &events); err != nil {
		var single map[string]interface{}
		if err2 := json.Unmarshal(decoded, &single); err2 != nil {
			return nil
		}
		events = []map[string]interface{}{single}
	}

	dateRe := regexp.MustCompile(`/Date\((\d+)\)/`)
	var items []string
	for i, ev := range events {
		ts := fixEventDate(fmt.Sprintf("%v", ev["TimeCreated"]), dateRe)
		provider := cleanText(fmt.Sprintf("%v", ev["ProviderName"]))
		eventID := cleanText(fmt.Sprintf("%v", ev["Id"]))
		level := cleanText(fmt.Sprintf("%v", ev["LevelDisplayName"]))
		message := cleanText(fmt.Sprintf("%v", ev["Message"]))
		items = append(items, fmt.Sprintf(
			"Event[%d] | Log Name: %s | Source: %s | Id: %s | Level: %s | Date: %s | Message: %s",
			i, logName, provider, eventID, level, ts, message,
		))
	}
	return items
}

func fixEventDate(ts string, re *regexp.Regexp) string {
	m := re.FindStringSubmatch(ts)
	if m != nil {
		ms := int64(0)
		fmt.Sscanf(m[1], "%d", &ms)
		t := time.UnixMilli(ms).UTC()
		return t.Format("2006-01-02 15:04:05")
	}
	return ts
}

// ── Virtual Machines ──────────────────────────────────────────────────────────

func collectVMs() []VMEntry {
	var vms []VMEntry

	// Hyper-V
	if hvOut := runPS(`Get-VM | Select-Object Name,State | ConvertTo-Json -Compress`, 10); hvOut != "" {
		stateMap := map[int]string{
			2: "Running", 3: "Off", 6: "Paused", 9: "Saved", 10: "Starting", 11: "Stopping",
		}
		var hvRaw []map[string]interface{}
		if err := json.Unmarshal([]byte(hvOut), &hvRaw); err != nil {
			var single map[string]interface{}
			if err2 := json.Unmarshal([]byte(hvOut), &single); err2 == nil {
				hvRaw = []map[string]interface{}{single}
			}
		}
		for _, vm := range hvRaw {
			name := fmt.Sprintf("%v", vm["Name"])
			state := "unknown"
			if n, ok := vm["State"].(float64); ok {
				if s, ok := stateMap[int(n)]; ok {
					state = s
				} else {
					state = fmt.Sprintf("State_%d", int(n))
				}
			}
			vms = append(vms, VMEntry{Name: name, State: state, Type: "Hyper-V"})
		}
	}

	// VirtualBox
	vboxPaths := []string{
		"VBoxManage",
		`C:\Program Files\Oracle\VirtualBox\VBoxManage.exe`,
		`C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe`,
	}
	for _, vbox := range vboxPaths {
		if out := runCmd(vbox, []string{"list", "vms"}, 8); out != "" {
			runningSet := vboxNameSet(runCmd(vbox, []string{"list", "runningvms"}, 8))
			for _, line := range strings.Split(out, "\n") {
				line = strings.TrimSpace(line)
				if line == "" {
					continue
				}
				name := strings.Trim(strings.SplitN(line, "{", 2)[0], `" `)
				state := "off"
				if runningSet[name] {
					state = "running"
				}
				vms = append(vms, VMEntry{Name: name, State: state, Type: "VirtualBox"})
			}
			break
		}
	}

	// VMware
	vmrunPaths := []string{
		"vmrun",
		`C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe`,
		`C:\Program Files\VMware\VMware Workstation\vmrun.exe`,
	}
	vmxRunning := map[string]bool{}
	for _, vmrun := range vmrunPaths {
		if out := runCmd(vmrun, []string{"list"}, 8); out != "" {
			for _, line := range strings.Split(out, "\n") {
				line = strings.TrimSpace(line)
				if strings.HasSuffix(strings.ToLower(line), ".vmx") {
					vmxRunning[strings.ToLower(line)] = true
				}
			}
			break
		}
	}

	addedVMX := map[string]bool{}
	for vmx := range vmwareInventoriesWin() {
		isRun := false
		vmxLow := strings.ToLower(vmx)
		for k := range vmxRunning {
			if strings.Contains(k, vmxLow) || strings.Contains(vmxLow, k) {
				isRun = true
			}
		}
		name := strings.TrimSuffix(filepath.Base(vmx), filepath.Ext(vmx))
		state := "off"
		if isRun {
			state = "running"
		}
		vms = append(vms, VMEntry{Name: name, State: state, Type: "VMware"})
		addedVMX[vmxLow] = true
	}
	for k := range vmxRunning {
		if !addedVMX[k] {
			base := k[strings.LastIndexAny(k, `/\`)+1:]
			name := strings.TrimSuffix(base, ".vmx")
			vms = append(vms, VMEntry{Name: name, State: "running", Type: "VMware"})
		}
	}

	if vms == nil {
		vms = []VMEntry{}
	}
	return vms
}

func vmwareInventoriesWin() map[string]bool {
	result := map[string]bool{}
	for _, base := range []string{os.Getenv("APPDATA"), os.Getenv("LOCALAPPDATA")} {
		inv := filepath.Join(base, "VMware", "inventory.vmls")
		data, err := os.ReadFile(inv)
		if err != nil {
			continue
		}
		re := regexp.MustCompile(`(?i)config\d+\.\d+\s*=\s*"([^"]+\.vmx)"`)
		for _, m := range re.FindAllStringSubmatch(string(data), -1) {
			result[m[1]] = true
		}
		break
	}
	return result
}

// ── Docker (uses shared collectDockerCLI) ─────────────────────────────────────

var dockerKnownPaths = []string{
	`C:\Program Files\Docker\Docker\resources\bin\docker.exe`,
	`C:\ProgramData\DockerDesktop\version-bin\docker.exe`,
	`C:\Program Files\Docker\resources\bin\docker.exe`,
}

func resolveDockerExe() string {
	if p, err := exec.LookPath("docker"); err == nil {
		return p
	}
	for _, p := range dockerKnownPaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "docker"
}

func runDockerCollect() []DockerContainer {
	return collectDockerCLI(resolveDockerExe())
}

// ── runCmd on Windows (hides console window) ──────────────────────────────────

func runCmd(name string, args []string, timeoutSec int) string {
	ctx, cancel := timedContext(time.Duration(timeoutSec) * time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = hiddenSysProcAttr()
	// Discard stderr so warnings don't interfere; capture stdout only.
	cmd.Stderr = nil
	out, err := cmd.Output()
	if err != nil {
		// Non-zero exit (e.g. docker exits 255 on warnings): return stdout if present.
		if len(out) > 0 {
			return strings.TrimSpace(string(out))
		}
		return ""
	}
	return strings.TrimSpace(string(out))
}
