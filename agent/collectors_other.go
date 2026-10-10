//go:build !windows

package main

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	gopshost "github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
)

// ── Load avg ──────────────────────────────────────────────────────────────────

func getLoadAvg() ([3]float64, error) {
	avg, err := load.Avg()
	if err != nil {
		return [3]float64{}, err
	}
	return [3]float64{avg.Load1, avg.Load5, avg.Load15}, nil
}

// ── Battery ───────────────────────────────────────────────────────────────────

func getBattery() (*BatteryInfo, error) {
	return nil, nil
}

// ── Temperatures ──────────────────────────────────────────────────────────────

func collectTemperatures() []Temperature {
	temps, err := gopshost.SensorsTemperatures()
	if err != nil {
		return []Temperature{}
	}
	var out []Temperature
	for _, t := range temps {
		out = append(out, Temperature{
			Sensor:   t.SensorKey,
			Label:    t.SensorKey,
			Current:  t.Temperature,
			High:     t.High,
			Critical: t.Critical,
		})
	}
	return out
}

// ── Services (systemd) ────────────────────────────────────────────────────────

func collectServices() []ServiceEntry {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx,
		"systemctl", "list-units", "--type=service", "--all", "--no-pager", "--plain",
	).Output()
	if err != nil {
		return []ServiceEntry{}
	}
	var services []ServiceEntry
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		name := strings.TrimSuffix(fields[0], ".service")
		if name == "" || strings.HasPrefix(name, "●") {
			continue
		}
		sub := fields[3]
		status := "inactive"
		if sub == "running" {
			status = "active"
		} else if fields[2] == "failed" {
			status = "failed"
		}
		services = append(services, ServiceEntry{
			Name:        name,
			DisplayName: name,
			Status:      status,
			StartType:   "automatic",
		})
	}
	return services
}

// ── Security ──────────────────────────────────────────────────────────────────

var securityWarnedOnce bool

func collectSecurity() SecurityInfo {
	return collectSecurityUnix()
}

// ── Recent logs ───────────────────────────────────────────────────────────────

func splitLogLines(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

func getRecentLogLines(cmdName string, args []string, fallbackFile string, count int) []string {
	out := runCmd(cmdName, args, 3)
	lines := splitLogLines(out)
	if len(lines) > 0 {
		if len(lines) > count {
			return lines[len(lines)-count:]
		}
		return lines
	}
	if fallbackFile != "" {
		fOut := runCmd("tail", []string{"-n", fmt.Sprintf("%d", count), fallbackFile}, 2)
		fLines := splitLogLines(fOut)
		if len(fLines) > 0 {
			return fLines
		}
	}
	return []string{}
}

func collectRecentLogs() RecentLogs {
	sys := getRecentLogLines("journalctl", []string{"-n", "50", "--no-pager", "-o", "short-iso"}, "/var/log/syslog", 50)
	if len(sys) == 0 {
		sys = getRecentLogLines("tail", []string{"-n", "50", "/var/log/messages"}, "", 50)
	}

	auth := getRecentLogLines("journalctl", []string{"-u", "ssh", "-u", "sshd", "-n", "50", "--no-pager", "-o", "short-iso"}, "/var/log/auth.log", 50)
	if len(auth) == 0 {
		auth = getRecentLogLines("tail", []string{"-n", "50", "/var/log/secure"}, "", 50)
	}

	errLogs := getRecentLogLines("journalctl", []string{"-p", "err..emerg", "-n", "50", "--no-pager", "-o", "short-iso"}, "/var/log/kern.log", 50)
	if len(errLogs) == 0 {
		dmesg := runCmd("dmesg", []string{"-T"}, 2)
		dL := splitLogLines(dmesg)
		if len(dL) > 50 {
			errLogs = dL[len(dL)-50:]
		} else {
			errLogs = dL
		}
	}

	var filteredErr []string
	for _, l := range errLogs {
		if strings.Contains(l, "kex_exchange_identification") || strings.Contains(l, "Connection closed by") || strings.Contains(l, "Disconnected from invalid user") {
			continue
		}
		filteredErr = append(filteredErr, l)
	}
	if filteredErr == nil {
		filteredErr = []string{}
	}

	return RecentLogs{
		System: sys,
		Auth:   auth,
		Error:  filteredErr,
	}
}

// ── Virtual Machines ──────────────────────────────────────────────────────────

func collectVMs() []VMEntry {
	return collectVMsUnix()
}

// ── Docker ────────────────────────────────────────────────────────────────────

func runDockerCollect() []DockerContainer {
	return collectDockerCLI("docker")
}

// ── runCmd on non-Windows ─────────────────────────────────────────────────────

func runCmd(name string, args []string, timeoutSec int) string {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		if len(out) > 0 {
			return strings.TrimSpace(string(out))
		}
		return ""
	}
	return strings.TrimSpace(string(out))
}

func timedContext(d time.Duration) context.Context {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	_ = cancel
	return ctx
}
