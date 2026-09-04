package main

import (
	"log"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

const defaultBackend = "http://127.0.0.1:8000"
const defaultServerID = "srv-local"
const defaultInterval = 15
const bufferMaxLen = 25

var safeIDRe = regexp.MustCompile(`[^a-zA-Z0-9_\-.]`)

type Config struct {
	BackendURL           string
	ServerID             string
	Interval             int
	IngestKey            string
	ForceStart           bool
	AllowInsecureBackend bool
	IsWindows            bool
	Here                 string
	PauseFlag            string
	Heartbeat            string
	Version              string
	WebLogPath           string
	MonitorDatabases     string
	MonitorNetEquip      string
	MonitorSSLDomains    string
}

func loadConfig() Config {
	here, _ := os.Executable()
	// Use the directory of the executable so heartbeat/pause-flag live next to it.
	idx := strings.LastIndexAny(here, `/\`)
	if idx >= 0 {
		here = here[:idx]
	} else {
		here = "."
	}

	// Auto-load agent.env from executable directory (env vars take priority).
	loadEnvFile(here + string(os.PathSeparator) + "agent.env")

	version := readVersion(here)

	rawBackend := strings.TrimRight(strings.TrimSpace(envOr("BACKEND_URL", defaultBackend)), "/")
	if !strings.HasPrefix(rawBackend, "http://") && !strings.HasPrefix(rawBackend, "https://") {
		rawBackend = defaultBackend
	}

	rawServer := strings.TrimSpace(envOr("SERVER_ID", defaultServerID))
	cleaned := safeIDRe.ReplaceAllString(rawServer, "-")
	if len(cleaned) > 64 {
		cleaned = cleaned[:64]
	}
	cleaned = strings.Trim(cleaned, "-")
	if cleaned == "" {
		cleaned = defaultServerID
	}
	if cleaned != rawServer {
		log.Printf("SERVER_ID sanitized: %q -> %q", rawServer, cleaned)
	}

	interval := defaultInterval
	if v := strings.TrimSpace(os.Getenv("INTERVAL")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 {
			interval = n
		}
	}

	ingestKey := strings.TrimSpace(os.Getenv("INGEST_API_KEY"))
	if ingestKey == "" {
		ingestKey = strings.TrimSpace(os.Getenv("AGENT_KEY"))
	}
	forceStart := isTruthy(os.Getenv("AGENT_FORCE_START"))
	allowInsecureBackend := isTruthy(os.Getenv("ALLOW_INSECURE_BACKEND"))
	webLogPath := strings.TrimSpace(os.Getenv("WEB_LOG_PATH"))
	monitorDatabases := strings.TrimSpace(os.Getenv("MONITOR_DATABASES"))
	monitorNetEquip := strings.TrimSpace(os.Getenv("MONITOR_NET_EQUIP"))
	monitorSSLDomains := strings.TrimSpace(os.Getenv("MONITOR_SSL_DOMAINS"))

	return Config{
		BackendURL:           rawBackend,
		ServerID:             cleaned,
		Interval:             interval,
		IngestKey:            ingestKey,
		ForceStart:           forceStart,
		AllowInsecureBackend: allowInsecureBackend,
		IsWindows:            runtime.GOOS == "windows",
		Here:                 here,
		PauseFlag:            here + string(os.PathSeparator) + ".agent_paused",
		Heartbeat:            here + string(os.PathSeparator) + "agent_heartbeat.json",
		Version:              version,
		WebLogPath:           webLogPath,
		MonitorDatabases:     monitorDatabases,
		MonitorNetEquip:      monitorNetEquip,
		MonitorSSLDomains:    monitorSSLDomains,
	}
}

// loadEnvFile reads KEY=VALUE pairs from a file and sets them as env vars,
// but only if the variable is not already set in the environment.
func loadEnvFile(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	content := string(data)
	content = strings.TrimPrefix(content, "\xef\xbb\xbf")
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if key == "" {
			continue
		}
		// Env var takes priority over file
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

func readVersion(dir string) string {
	data, err := os.ReadFile(dir + string(os.PathSeparator) + "VERSION")
	if err == nil {
		v := strings.TrimSpace(string(data))
		if v != "" {
			return v
		}
	}
	return "3.0.0"
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func isTruthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
