package main

import (
	"log"
	"math"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/process"
)

const maxBuffer = 25

func main() {
	cfg := loadConfig()

	log.SetFlags(log.LstdFlags)

	log.Printf("[agent] v%s  backend=%s  server_id=%s  interval=%ds  os=%s",
		cfg.Version, cfg.BackendURL, cfg.ServerID, cfg.Interval, runtime.GOOS)

	if cfg.IngestKey == "" {
		log.Printf("[agent] WARNING: INGEST_API_KEY not set – metrics sent without authentication")
	}

	if strings.HasPrefix(cfg.BackendURL, "http://") && !cfg.AllowInsecureBackend &&
		!strings.HasPrefix(cfg.BackendURL, "http://127.0.0.1") &&
		!strings.HasPrefix(cfg.BackendURL, "http://localhost") {
		log.Printf("[agent] WARNING: backend URL uses insecure HTTP. Use HTTPS in production or set ALLOW_INSECURE_BACKEND=1 for local/dev environments")
	}

	if isPaused(cfg) && !cfg.ForceStart {
		log.Printf("[agent] paused by GUI flag, exiting")
		os.Exit(0)
	}

	// Warm up CPU percent baselines (first call always returns 0).
	_, _ = cpu.Percent(0, false)
	_, _ = cpu.Percent(0, true)

	// Warm up per-process CPU baseline so first cycle shows real deltas.
	if procs, err := process.Processes(); err == nil {
		for _, p := range procs {
			_, _ = p.CPUPercent()
		}
	}

	// Slow-collector caches.
	dockerCache := NewCache[[]DockerContainer]()
	vmCache := NewCache[[]VMEntry]()
	svcCache := NewCache[[]ServiceEntry]()
	secCache := NewCache[SecurityInfo]()
	logCache := NewCache[RecentLogs]()
	tempCache := NewCache[[]Temperature]()
	dbCache := NewCache[[]DBStatus]()
	netCache := NewCache[[]NetEquipStatus]()
	sslCache := NewCache[[]SSLCertStatus]()

	sender := NewSender(cfg)

	// Initial snapshots for delta metrics.
	prevNet := snapshotNet()
	prevDisk, diskErr := snapshotDiskIO()
	if diskErr != nil {
		prevDisk = nil
	}

	var shutdown atomic.Bool
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-quit
		log.Printf("[agent] signal received – shutting down gracefully")
		shutdown.Store(true)
	}()

	warmupDone := false
	var lastSendMs float64
	var bufLen int

	interval := time.Duration(cfg.Interval) * time.Second
	ttlFast := time.Duration(maxInt(cfg.Interval, 60)) * time.Second
	ttlSlow := time.Duration(maxInt(cfg.Interval, 120)) * time.Second

	for !shutdown.Load() {
		tStart := time.Now()

		// ── Fast collectors ─────────────────────────────────────────────────
		cpuDetail := collectCPU()
		ramDetail := collectRAM()
		swapDetail := collectSwap()
		disks := collectDisks()
		sysInfo := collectSysInfo()
		procs := collectProcesses(10)
		battery := collectBattery()
		la1, la5, la15 := collectLoadAvg(cpuDetail.Percent, cpuDetail.CoresLogical)

		curNet, netIn, netOut, ifaces, conns := collectNetwork(prevNet)
		prevNet = curNet

		var diskIO DiskIO
		if prevDisk != nil {
			if nd, err := snapshotDiskIO(); err == nil {
				diskIO = calcDiskIO(prevDisk, nd)
				prevDisk = nd
			}
		}

		diskPct := 0.0
		for _, d := range disks {
			if d.Percent > diskPct {
				diskPct = d.Percent
			}
		}

		// ── Slow collectors (TTL-cached, run in goroutines) ─────────────────
		slow := collectSlowMetrics(
			dockerCache, vmCache, svcCache, secCache, logCache, tempCache,
			dbCache, netCache, sslCache, cfg,
			ttlFast, ttlSlow,
		)

		wasWarmup := !warmupDone
		warmupDone = true

		selfMem, _ := selfMemory()
		ts := time.Now().Unix()
		webMetrics := collectWebMetrics(cfg.WebLogPath)

		payload := &Payload{
			Service:      "agent",
			AgentVersion: cfg.Version,
			Timestamp:    ts,
			ServerID:     cfg.ServerID,
			Metric:       "system",
			Status:       "ok",
			Warmup:       wasWarmup,

			Metrics: Metrics{
				CPU:         MetricValue{Value: cpuDetail.Percent, Unit: "%"},
				RAM:         MetricValue{Value: ramDetail.Percent, Unit: "%"},
				Disk:        MetricValue{Value: diskPct, Unit: "%"},
				Swap:        MetricValue{Value: swapDetail.Percent, Unit: "%"},
				NetIn:       MetricValue{Value: netIn, Unit: "Mbps"},
				NetOut:      MetricValue{Value: netOut, Unit: "Mbps"},
				Load1:       MetricValue{Value: round2(la1), Unit: ""},
				Load5:       MetricValue{Value: round2(la5), Unit: ""},
				Load15:      MetricValue{Value: round2(la15), Unit: ""},
				Processes:   MetricValue{Value: float64(procs.Total), Unit: ""},
				UptimeHours: MetricValue{Value: sysInfo.UptimeHours, Unit: "ч"},
				IOPSRead:    MetricValue{Value: diskIO.IOPSRead, Unit: "IO/s"},
				IOPSWrite:   MetricValue{Value: diskIO.IOPSWrite, Unit: "IO/s"},
			},

			SystemInfo:         sysInfo,
			CPUDetail:          cpuDetail,
			RAMDetail:          ramDetail,
			SwapDetail:         swapDetail,
			Disks:              nonNilDisks(disks),
			DiskIO:             diskIO,
			NetworkInterfaces:  nonNilIfaces(ifaces),
			NetworkConnections: conns,
			ProcessesDetail:    procs,
			Services:           nonNilSvcs(slow.Services),
			DockerContainers:   nonNilDocker(slow.Docker),
			VirtualMachines:    nonNilVMs(slow.VirtualMachines),
			RecentLogs:         nonNilLogs(slow.RecentLogs),
			Security:           slow.Security,
			Temperatures:       nonNilTemps(slow.Temperatures),
			Battery:            battery,
			WebMetrics:         webMetrics,
			Databases:          slow.Databases,
			NetworkEquipment:   slow.NetworkEquip,
			SSLCertificates:    slow.SSLCerts,
			AgentSelf: AgentSelf{
				PID:        os.Getpid(),
				MemoryMb:   selfMem,
				LastSendMs: math.Round(lastSendMs),
				BufferLen:  bufLen,
			},
		}

		_ = sender.Send(payload, &bufLen)
		lastSendMs = float64(time.Since(tStart).Milliseconds())

		// Interruptible sleep — checks shutdown and pause flag every 500ms.
		deadline := time.Now().Add(interval)
		for !shutdown.Load() && time.Now().Before(deadline) {
			if cfg.IsWindows && isPaused(cfg) {
				log.Printf("[agent] pause flag detected – stopping agent")
				shutdown.Store(true)
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
	}

	log.Printf("[agent] main loop exited cleanly")
}

func isPaused(cfg Config) bool {
	_, err := os.Stat(cfg.PauseFlag)
	return err == nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func selfMemory() (float64, error) {
	p, err := process.NewProcess(int32(os.Getpid()))
	if err != nil {
		return 0, err
	}
	mi, err := p.MemoryInfo()
	if err != nil {
		return 0, err
	}
	return round1(float64(mi.RSS) / mib), nil
}

type slowMetrics struct {
	Docker          []DockerContainer
	VirtualMachines []VMEntry
	Services        []ServiceEntry
	Security        SecurityInfo
	RecentLogs      RecentLogs
	Temperatures    []Temperature
	Databases       []DBStatus
	NetworkEquip    []NetEquipStatus
	SSLCerts        []SSLCertStatus
}

func collectSlowMetrics(
	dockerCache *Cache[[]DockerContainer],
	vmCache *Cache[[]VMEntry],
	svcCache *Cache[[]ServiceEntry],
	secCache *Cache[SecurityInfo],
	logCache *Cache[RecentLogs],
	tempCache *Cache[[]Temperature],
	dbCache *Cache[[]DBStatus],
	netCache *Cache[[]NetEquipStatus],
	sslCache *Cache[[]SSLCertStatus],
	cfg Config,
	ttlFast time.Duration,
	ttlSlow time.Duration,
) slowMetrics {
	var out slowMetrics
	var wg sync.WaitGroup
	wg.Add(9)

	go func() {
		defer wg.Done()
		out.Docker = dockerCache.Get("docker", ttlFast, func() []DockerContainer { return collectDocker() })
	}()
	go func() {
		defer wg.Done()
		out.VirtualMachines = vmCache.Get("vms", ttlSlow, func() []VMEntry { return collectVMs() })
	}()
	go func() {
		defer wg.Done()
		out.Services = svcCache.Get("services", ttlFast, func() []ServiceEntry { return collectServices() })
	}()
	go func() {
		defer wg.Done()
		out.Security = secCache.Get("security", ttlFast, func() SecurityInfo { return collectSecurity() })
	}()
	go func() {
		defer wg.Done()
		out.RecentLogs = logCache.Get("logs", ttlSlow, func() RecentLogs { return collectRecentLogs() })
	}()
	go func() {
		defer wg.Done()
		out.Temperatures = tempCache.Get("temps", ttlSlow, func() []Temperature { return collectTemperatures() })
	}()
	go func() {
		defer wg.Done()
		out.Databases = dbCache.Get("dbs", ttlFast, func() []DBStatus { return collectDBs(cfg.MonitorDatabases) })
	}()
	go func() {
		defer wg.Done()
		out.NetworkEquip = netCache.Get("netequip", ttlFast, func() []NetEquipStatus { return collectNetEquip(cfg.MonitorNetEquip) })
	}()
	go func() {
		defer wg.Done()
		out.SSLCerts = sslCache.Get("sslcerts", ttlSlow, func() []SSLCertStatus { return collectSSLCerts(cfg.MonitorSSLDomains) })
	}()

	wg.Wait()
	return out
}

func nonNilDisks(s []DiskPartition) []DiskPartition {
	if s == nil {
		return []DiskPartition{}
	}
	return s
}
func nonNilIfaces(s []NetworkInterface) []NetworkInterface {
	if s == nil {
		return []NetworkInterface{}
	}
	return s
}
func nonNilSvcs(s []ServiceEntry) []ServiceEntry {
	if s == nil {
		return []ServiceEntry{}
	}
	return s
}
func nonNilDocker(s []DockerContainer) []DockerContainer {
	if s == nil {
		return []DockerContainer{}
	}
	return s
}
func nonNilVMs(s []VMEntry) []VMEntry {
	if s == nil {
		return []VMEntry{}
	}
	return s
}
func nonNilTemps(s []Temperature) []Temperature {
	if s == nil {
		return []Temperature{}
	}
	return s
}
func nonNilLogs(l RecentLogs) RecentLogs {
	if l.System == nil {
		l.System = []string{}
	}
	if l.Auth == nil {
		l.Auth = []string{}
	}
	if l.Error == nil {
		l.Error = []string{}
	}
	return l
}
