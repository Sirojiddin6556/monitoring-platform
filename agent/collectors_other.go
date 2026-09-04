//go:build !windows

package main

import (
	"context"
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

func collectRecentLogs() RecentLogs {
	return RecentLogs{System: []string{}, Auth: []string{}, Error: []string{}}
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
