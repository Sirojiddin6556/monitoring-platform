package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	psnet "github.com/shirou/gopsutil/v3/net"
)

// ── Cross-platform security (open ports + SSH) ────────────────────────────────

func collectSecurityUnix() SecurityInfo {
	conns, err := psnet.Connections("tcp")
	if err != nil {
		return SecurityInfo{OpenPorts: []int{}, ActiveSSHSessions: 0, ActiveUsers: 0, ActiveVPNSessions: 0, FailedLogins24h: 0}
	}

	var openPorts []int
	activeSSH := 0
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

	// Collect active users
	activeUsers := 0
	if out := runCmd("who", nil, 5); out != "" {
		activeUsers = len(strings.Split(strings.TrimSpace(out), "\n"))
	}

	// Collect VPN sessions (tun/tap/wg interfaces)
	activeVPNs := 0
	if out := runCmd("ip", []string{"link", "show"}, 5); out != "" {
		for _, line := range strings.Split(out, "\n") {
			lineLower := strings.ToLower(line)
			if strings.Contains(lineLower, ": tun") || strings.Contains(lineLower, ": tap") || strings.Contains(lineLower, ": wg") {
				activeVPNs++
			}
		}
	}

	return SecurityInfo{
		OpenPorts:         openPorts,
		ActiveSSHSessions: activeSSH,
		ActiveUsers:       activeUsers,
		ActiveVPNSessions: activeVPNs,
		FailedLogins24h:   0,
	}
}

// ── Cross-platform VMs (VirtualBox + VMware via CLI) ─────────────────────────

func collectVMsUnix() []VMEntry {
	var vms []VMEntry

	if out := runCmd("VBoxManage", []string{"list", "vms"}, 8); out != "" {
		runningOut := runCmd("VBoxManage", []string{"list", "runningvms"}, 8)
		runningSet := vboxNameSet(runningOut)
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
	}

	if out := runCmd("vmrun", []string{"list"}, 8); out != "" {
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasSuffix(strings.ToLower(line), ".vmx") {
				idx := strings.LastIndexAny(line, `/\`)
				base := line[idx+1:]
				name := strings.TrimSuffix(base, ".vmx")
				vms = append(vms, VMEntry{Name: name, State: "running", Type: "VMware"})
			}
		}
	}

	if vms == nil {
		vms = []VMEntry{}
	}
	return vms
}

func vboxNameSet(out string) map[string]bool {
	set := map[string]bool{}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		name := strings.Trim(strings.SplitN(line, "{", 2)[0], `" `)
		set[name] = true
	}
	return set
}

// ── Docker (CLI-based, cross-platform) ───────────────────────────────────────

func collectDockerCLI(dockerExe string) []DockerContainer {
	if dockerExe == "" {
		dockerExe = "docker"
	}
	out := runCmd(dockerExe, []string{"ps", "-a", "--format", "{{json .}}", "--no-trunc"}, 10)
	if out == "" {
		return nil
	}

	type statsEntry struct {
		CPUPercent float64
		MemMb      float64
		MemPercent float64
	}
	statsMap := map[string]statsEntry{}
	if statsOut := runCmd(dockerExe, []string{"stats", "--no-stream", "--format", "{{json .}}"}, 12); statsOut != "" {
		for _, line := range strings.Split(statsOut, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var raw map[string]json.RawMessage
			if err := json.Unmarshal([]byte(line), &raw); err != nil {
				continue
			}
			strF := func(key string) string {
				v, ok := raw[key]
				if !ok {
					return ""
				}
				var s string
				if err := json.Unmarshal(v, &s); err != nil {
					return strings.Trim(string(v), `"`)
				}
				return s
			}
			name := strF("Name")
			if name == "" {
				name = strF("Container")
			}
			if name == "" {
				continue
			}
			statsMap[name] = statsEntry{
				CPUPercent: parsePct(strF("CPUPerc")),
				MemMb:      parseMemMb(strF("MemUsage")),
				MemPercent: parsePct(strF("MemPerc")),
			}
		}
	}

	var containers []DockerContainer
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Use RawMessage so nested objects (e.g. "Platform") don't break parsing.
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		strField := func(key string) string {
			v, ok := raw[key]
			if !ok {
				return ""
			}
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				return strings.Trim(string(v), `"`)
			}
			return s
		}
		statusText := strings.ToLower(strField("Status"))
		state := strings.ToLower(strField("State"))
		if state == "" {
			switch {
			case strings.HasPrefix(statusText, "up"):
				state = "running"
			case strings.Contains(statusText, "exited"):
				state = "exited"
			default:
				state = "unknown"
			}
		}
		name := strField("Names")
		if name == "" {
			name = strField("Name")
		}
		st := statsMap[name]
		containers = append(containers, DockerContainer{
			ID:         strField("ID"),
			Name:       name,
			Image:      strField("Image"),
			Status:     state,
			CPUPercent: st.CPUPercent,
			MemMb:      st.MemMb,
			MemPercent: st.MemPercent,
		})
	}
	return containers
}

// ── Shared string helpers ─────────────────────────────────────────────────────

func parsePct(s string) float64 {
	s = strings.TrimSuffix(strings.TrimSpace(s), "%")
	s = strings.ReplaceAll(s, ",", ".")
	var f float64
	if err := json.Unmarshal([]byte(s), &f); err == nil {
		return round2(f)
	}
	return 0
}

func parseMemMb(s string) float64 {
	parts := strings.Fields(strings.SplitN(s, "/", 2)[0])
	if len(parts) == 0 {
		return 0
	}
	val := strings.ReplaceAll(parts[0], ",", ".")
	var f float64
	if err := json.Unmarshal([]byte(val), &f); err != nil {
		return 0
	}
	if len(parts) > 1 {
		unit := strings.ToLower(parts[1])
		if strings.HasPrefix(unit, "g") {
			return round2(f * 1024)
		}
		if strings.HasPrefix(unit, "k") {
			return round2(f / 1024)
		}
	}
	return round2(f)
}

func dedupe(items []string, max int) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range items {
		if s = strings.TrimSpace(s); s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
			if len(out) >= max {
				break
			}
		}
	}
	return out
}

func cleanText(s string) string {
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "�")
	}
	s = strings.NewReplacer("\r", " ", "\n", " ").Replace(s)
	// strip C0/C1 control chars
	var b strings.Builder
	for _, r := range s {
		if r < 0x20 || r == 0x7F {
			b.WriteByte(' ')
		} else {
			b.WriteRune(r)
		}
	}
	s = b.String()
	// collapse whitespace
	prev := ' '
	b.Reset()
	for _, r := range s {
		if r == ' ' && prev == ' ' {
			continue
		}
		b.WriteRune(r)
		prev = r
	}
	return strings.TrimSpace(b.String())
}

// ── Web Traffic / Log parsing ──────────────────────────────────────────────────

var (
	webLogOffset   int64     = -1
	webLogLastTime time.Time = time.Now()
)

var defaultWebLogs = []string{
	"/var/log/nginx/access.log",
	"/var/log/apache2/access.log",
	"/var/log/httpd/access_log",
	"C:\\nginx\\logs\\access.log",
}

func collectWebMetrics(logPath string) *WebMetrics {
	// 1. Resolve path if empty
	targetPath := logPath
	if targetPath == "" {
		for _, p := range defaultWebLogs {
			if _, err := os.Stat(p); err == nil {
				targetPath = p
				break
			}
		}
	}
	if targetPath == "" {
		return nil
	}

	// 2. Open log file
	file, err := os.Open(targetPath)
	if err != nil {
		return nil
	}
	defer file.Close()

	fi, err := file.Stat()
	if err != nil {
		return nil
	}

	currSize := fi.Size()
	now := time.Now()
	elapsed := now.Sub(webLogLastTime).Seconds()
	webLogLastTime = now
	if elapsed <= 0 {
		elapsed = 1.0
	}

	// First run: just initialize offset to current file size and exit
	if webLogOffset == -1 {
		webLogOffset = currSize
		return &WebMetrics{}
	}

	// If file was truncated/rotated
	if currSize < webLogOffset {
		webLogOffset = 0
	}

	if currSize == webLogOffset {
		return &WebMetrics{RPS: 0.0}
	}

	// Seek to last read offset
	_, err = file.Seek(webLogOffset, io.SeekStart)
	if err != nil {
		return nil
	}

	// Read new content
	buf := make([]byte, currSize-webLogOffset)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		return nil
	}

	webLogOffset += int64(n)

	// Parse lines
	lines := strings.Split(string(buf[:n]), "\n")
	totalRequests := 0
	h2xx, h3xx, h4xx, h5xx := 0, 0, 0, 0

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		status := parseNginxLine(line)
		if status > 0 {
			totalRequests++
			if status >= 200 && status < 300 {
				h2xx++
			} else if status >= 300 && status < 400 {
				h3xx++
			} else if status >= 400 && status < 500 {
				h4xx++
			} else if status >= 500 && status < 600 {
				h5xx++
			}
		}
	}

	return &WebMetrics{
		RPS:     round2(float64(totalRequests) / elapsed),
		HTTP2xx: h2xx,
		HTTP3xx: h3xx,
		HTTP4xx: h4xx,
		HTTP5xx: h5xx,
	}
}

func parseNginxLine(line string) int {
	idx1 := strings.Index(line, "\"")
	if idx1 == -1 {
		return 0
	}
	idx2 := strings.Index(line[idx1+1:], "\"")
	if idx2 == -1 {
		return 0
	}
	idx2 = idx1 + 1 + idx2

	after := strings.TrimSpace(line[idx2+1:])
	fields := strings.Fields(after)
	if len(fields) < 1 {
		return 0
	}

	status := 0
	_, _ = fmt.Sscanf(fields[0], "%d", &status)
	return status
}

