package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// CheckAndUpdate checks if a new version is available on the backend and updates the binary.
func CheckAndUpdate(cfg Config, force bool) (bool, error) {
	backendURL := strings.TrimRight(cfg.BackendURL, "/")
	versionURL := backendURL + "/agent/VERSION"

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, versionURL, nil)
	if err != nil {
		return false, fmt.Errorf("create version request: %w", err)
	}
	if cfg.IngestKey != "" {
		req.Header.Set("X-Ingest-Key", cfg.IngestKey)
	}

	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("fetch version from backend: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("version check returned HTTP %d", resp.StatusCode)
	}

	verBytes, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	if err != nil {
		return false, fmt.Errorf("read version body: %w", err)
	}

	targetVersion := strings.TrimSpace(string(verBytes))
	if targetVersion == "" {
		return false, fmt.Errorf("empty version received from backend")
	}

	currentVersion := strings.TrimSpace(cfg.Version)
	if !force && targetVersion == currentVersion {
		log.Printf("[updater] current version v%s is already up to date", currentVersion)
		return false, nil
	}

	log.Printf("[updater] new version available: current=v%s, target=v%s (force=%v)",
		currentVersion, targetVersion, force)

	if err := PerformSelfUpdate(cfg, targetVersion); err != nil {
		return false, err
	}

	return true, nil
}

// PerformSelfUpdate downloads the target binary and replaces the current executable.
func PerformSelfUpdate(cfg Config, targetVersion string) error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("find executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("eval symlinks: %w", err)
	}

	binName := "monitoring-agent-linux-amd64"
	switch runtime.GOOS {
	case "windows":
		binName = "MonitoringAgent.exe"
	case "darwin":
		binName = "monitoring-agent-darwin-amd64"
		if runtime.GOARCH == "arm64" {
			binName = "monitoring-agent-darwin-arm64"
		}
	default:
		switch runtime.GOARCH {
		case "arm64":
			binName = "monitoring-agent-linux-arm64"
		case "arm":
			binName = "monitoring-agent-linux-arm"
		default:
			binName = "monitoring-agent-linux-amd64"
		}
	}

	backendURL := strings.TrimRight(cfg.BackendURL, "/")
	downloadURL := backendURL + "/agent/" + binName
	log.Printf("[updater] downloading binary from: %s", downloadURL)

	client := &http.Client{Timeout: 90 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, downloadURL, nil)
	if err != nil {
		return fmt.Errorf("build download request: %w", err)
	}
	if cfg.IngestKey != "" {
		req.Header.Set("X-Ingest-Key", cfg.IngestKey)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download binary: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}

	dir := filepath.Dir(exePath)
	tmpFile := filepath.Join(dir, fmt.Sprintf(".monitoring-agent-new.%d", time.Now().UnixNano()))
	f, err := os.OpenFile(tmpFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}

	n, err := io.Copy(f, resp.Body)
	_ = f.Close()
	if err != nil {
		_ = os.Remove(tmpFile)
		return fmt.Errorf("write temp binary: %w", err)
	}

	if n < 1000000 {
		_ = os.Remove(tmpFile)
		return fmt.Errorf("downloaded binary too small (%d bytes), aborting", n)
	}

	if runtime.GOOS == "windows" {
		oldExe := exePath + ".old"
		_ = os.Remove(oldExe)
		if err := os.Rename(exePath, oldExe); err != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("rename running exe: %w", err)
		}
		if err := os.Rename(tmpFile, exePath); err != nil {
			_ = os.Rename(oldExe, exePath)
			return fmt.Errorf("replace exe: %w", err)
		}
	} else {
		if err := os.Chmod(tmpFile, 0755); err != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("chmod: %w", err)
		}
		// Backup old
		oldBackup := exePath + ".backup"
		_ = copyFile(exePath, oldBackup)

		if err := os.Rename(tmpFile, exePath); err != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("replace binary: %w", err)
		}
	}

	if targetVersion != "" {
		_ = os.WriteFile(filepath.Join(dir, "VERSION"), []byte(targetVersion+"\n"), 0644)
	}

	log.Printf("[updater] binary successfully updated! Path: %s (target: %s)", exePath, targetVersion)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// RestartService triggers a service restart or restarts current process.
func RestartService() {
	log.Printf("[updater] initiating agent restart...")
	if runtime.GOOS == "linux" {
		// Attempt systemctl restart
		cmd := exec.Command("systemctl", "restart", "monitoring-agent")
		if err := cmd.Start(); err == nil {
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
			return
		}
	}
	// Fallback: exit cleanly; systemd / service manager with Restart=always will relaunch it
	os.Exit(0)
}
