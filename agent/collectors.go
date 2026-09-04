package main

import (
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	gopshost "github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	gopsnet "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// ── CPU ──────────────────────────────────────────────────────────────────────

func collectCPU() CPUDetail {
	pct, _ := cpu.Percent(0, false)
	perCore, _ := cpu.Percent(0, true)
	info, _ := cpu.Info()
	times, _ := cpu.Times(false)
	logCores, _ := cpu.Counts(true)
	physCores, _ := cpu.Counts(false)

	var freqMhz float64
	if len(info) > 0 {
		freqMhz = math.Round(info[0].Mhz)
	}

	var user, system, idle, iowait float64
	if len(times) > 0 {
		t := times[0]
		total := t.User + t.System + t.Idle + t.Iowait + t.Nice + t.Irq + t.Softirq + t.Steal
		if total > 0 {
			user = round1(t.User / total * 100)
			system = round1(t.System / total * 100)
			idle = round1(t.Idle / total * 100)
			iowait = round1(t.Iowait / total * 100)
		}
	}

	cores := make([]float64, 0, len(perCore))
	for _, v := range perCore {
		cores = append(cores, round1(v))
	}

	var mainPct float64
	if len(pct) > 0 {
		mainPct = round1(pct[0])
	}

	return CPUDetail{
		Percent:       mainPct,
		CoresLogical:  logCores,
		CoresPhysical: physCores,
		FreqMHz:       freqMhz,
		PerCore:       cores,
		User:          user,
		System:        system,
		Idle:          idle,
		IOWait:        iowait,
	}
}

// ── RAM ──────────────────────────────────────────────────────────────────────

func collectRAM() RAMDetail {
	v, err := mem.VirtualMemory()
	if err != nil {
		return RAMDetail{}
	}
	return RAMDetail{
		TotalGB:     round2(float64(v.Total) / gib),
		UsedGB:      round2(float64(v.Used) / gib),
		AvailableGB: round2(float64(v.Available) / gib),
		FreeGB:      round2(float64(v.Free) / gib),
		CachedGB:    round2(float64(v.Cached) / gib),
		BuffersGB:   round2(float64(v.Buffers) / gib),
		Percent:     round1(v.UsedPercent),
	}
}

func collectSwap() SwapDetail {
	s, err := mem.SwapMemory()
	if err != nil {
		return SwapDetail{}
	}
	return SwapDetail{
		TotalGB: round2(float64(s.Total) / gib),
		UsedGB:  round2(float64(s.Used) / gib),
		Percent: round1(s.UsedPercent),
	}
}

// ── Disk ─────────────────────────────────────────────────────────────────────

func collectDisks() []DiskPartition {
	parts, err := disk.Partitions(false)
	if err != nil {
		return nil
	}
	var out []DiskPartition
	for _, p := range parts {
		u, err := disk.Usage(p.Mountpoint)
		if err != nil {
			continue
		}
		out = append(out, DiskPartition{
			Device:     p.Device,
			Mountpoint: p.Mountpoint,
			Fstype:     p.Fstype,
			TotalGB:    round2(float64(u.Total) / gib),
			UsedGB:     round2(float64(u.Used) / gib),
			FreeGB:     round2(float64(u.Free) / gib),
			Percent:    round1(u.UsedPercent),
		})
	}
	return out
}

type diskSnapshot struct {
	ReadBytes  uint64
	WriteBytes uint64
	ReadCount  uint64
	WriteCount uint64
	At         time.Time
}

func snapshotDiskIO() (*diskSnapshot, error) {
	counters, err := disk.IOCounters()
	if err != nil {
		return nil, err
	}
	var rb, wb, rc, wc uint64
	for _, c := range counters {
		rb += c.ReadBytes
		wb += c.WriteBytes
		rc += c.ReadCount
		wc += c.WriteCount
	}
	return &diskSnapshot{rb, wb, rc, wc, time.Now()}, nil
}

func calcDiskIO(prev, cur *diskSnapshot) DiskIO {
	if prev == nil || cur == nil {
		return DiskIO{}
	}
	dt := cur.At.Sub(prev.At).Seconds()
	if dt < 0.1 {
		return DiskIO{}
	}
	return DiskIO{
		ReadMBs:   round2(float64(deltaUint64(cur.ReadBytes, prev.ReadBytes)) / dt / mib),
		WriteMBs:  round2(float64(deltaUint64(cur.WriteBytes, prev.WriteBytes)) / dt / mib),
		IOPSRead:  round1(float64(deltaUint64(cur.ReadCount, prev.ReadCount)) / dt),
		IOPSWrite: round1(float64(deltaUint64(cur.WriteCount, prev.WriteCount)) / dt),
	}
}

// ── Network ───────────────────────────────────────────────────────────────────

type netSnapshot struct {
	Total map[string]gopsnet.IOCountersStat
	At    time.Time
}

func snapshotNet() *netSnapshot {
	counters, err := gopsnet.IOCounters(true)
	m := make(map[string]gopsnet.IOCountersStat)
	if err == nil {
		for _, c := range counters {
			m[c.Name] = c
		}
	}
	return &netSnapshot{Total: m, At: time.Now()}
}

func collectNetwork(prev *netSnapshot) (cur *netSnapshot, netIn, netOut float64, ifaces []NetworkInterface, conns NetworkConnections) {
	cur = snapshotNet()
	dt := cur.At.Sub(prev.At).Seconds()

	ifStats, _ := gopsnet.Interfaces()
	ifMap := make(map[string]gopsnet.InterfaceStat, len(ifStats))
	for _, s := range ifStats {
		ifMap[s.Name] = s
	}

	var totalRecv, totalSent uint64
	for name, c := range cur.Total {
		p := prev.Total[name]

		lname := strings.ToLower(name)
		recvDelta := deltaUint64(c.BytesRecv, p.BytesRecv)
		sentDelta := deltaUint64(c.BytesSent, p.BytesSent)

		if lname == "lo" || strings.Contains(lname, "loopback") {
			totalRecv += recvDelta
			totalSent += sentDelta
			continue
		}
		if st, ok := ifMap[name]; ok {
			up := false
			isLB := false
			for _, f := range st.Flags {
				if f == "up" {
					up = true
				}
				if f == "loopback" {
					isLB = true
				}
			}
			if !up || isLB {
				continue
			}
		}

		totalRecv += recvDelta
		totalSent += sentDelta

		var sIn, sOut float64
		if dt > 0.1 {
			sIn = math.Max(0, float64(recvDelta)*8/dt/1e6)
			sOut = math.Max(0, float64(sentDelta)*8/dt/1e6)
		}
		ifaces = append(ifaces, NetworkInterface{
			Name:         name,
			SpeedInMbps:  round3(sIn),
			SpeedOutMbps: round3(sOut),
			BytesRecv:    c.BytesRecv,
			BytesSent:    c.BytesSent,
			ErrorsIn:     int64(c.Errin),
			ErrorsOut:    int64(c.Errout),
			DropsIn:      int64(c.Dropin),
			DropsOut:     int64(c.Dropout),
		})
	}

	if dt > 0.1 {
		netIn = math.Max(0, round3(float64(totalRecv)*8/dt/1e6))
		netOut = math.Max(0, round3(float64(totalSent)*8/dt/1e6))
	}

	tcpConns, _ := gopsnet.Connections("tcp")
	byStatus := make(map[string]int)
	for _, c := range tcpConns {
		byStatus[c.Status]++
	}
	conns = NetworkConnections{Total: len(tcpConns), ByStatus: byStatus}
	return
}

// ── System info ───────────────────────────────────────────────────────────────

func collectSysInfo() SystemInfo {
	info, _ := gopshost.Info()

	var osName, osVer, kernel, hostname string
	var uptimeHours float64
	var bootTimeStr string

	if info != nil {
		hostname = info.Hostname
		osName = fmt.Sprintf("%s %s", info.OS, info.PlatformVersion)
		osVer = info.PlatformVersion
		kernel = info.KernelVersion
		uptimeHours = round1(float64(info.Uptime) / 3600)
		bt := time.Unix(int64(info.BootTime), 0)
		bootTimeStr = bt.Format("2006-01-02 15:04:05")
	} else {
		osName = runtime.GOOS
	}

	return SystemInfo{
		OS:           osName,
		OSVersion:    osVer,
		Kernel:       kernel,
		Hostname:     hostname,
		Architecture: runtime.GOARCH,
		BootTime:     bootTimeStr,
		UptimeHours:  uptimeHours,
	}
}

// ── Processes ─────────────────────────────────────────────────────────────────

func collectProcesses(topN int) ProcessesDetail {
	procs, err := process.Processes()
	if err != nil {
		return ProcessesDetail{TopCPU: []ProcessEntry{}, TopRAM: []ProcessEntry{}}
	}

	var entries []ProcessEntry
	zombieCount := 0
	for _, p := range procs {
		if p.Pid == 0 {
			continue
		}
		name, _ := p.Name()
		if name == "" {
			name = "?"
		}
		cpuPct, _ := p.CPUPercent()
		mi, _ := p.MemoryInfo()
		var ramMb float64
		if mi != nil {
			ramMb = round1(float64(mi.RSS) / mib)
		}
		statuses, _ := p.Status()
		st := "unknown"
		if len(statuses) > 0 {
			st = statuses[0]
			if st == "zombie" || st == "Z" {
				zombieCount++
			}
		}
		user, _ := p.Username()
		entries = append(entries, ProcessEntry{
			PID:    p.Pid,
			Name:   name,
			CPU:    round1(cpuPct),
			RAMMb:  ramMb,
			Status: st,
			User:   user,
		})
	}

	byCPU := make([]ProcessEntry, len(entries))
	copy(byCPU, entries)
	sort.Slice(byCPU, func(i, j int) bool { return byCPU[i].CPU > byCPU[j].CPU })
	if len(byCPU) > topN {
		byCPU = byCPU[:topN]
	}

	byRAM := make([]ProcessEntry, len(entries))
	copy(byRAM, entries)
	sort.Slice(byRAM, func(i, j int) bool { return byRAM[i].RAMMb > byRAM[j].RAMMb })
	if len(byRAM) > topN {
		byRAM = byRAM[:topN]
	}

	return ProcessesDetail{
		Total:  len(entries),
		Zombie: zombieCount,
		TopCPU: byCPU,
		TopRAM: byRAM,
	}
}

// ── Load average ──────────────────────────────────────────────────────────────

func collectLoadAvg(cpuPct float64, cores int) (float64, float64, float64) {
	if load, err := getLoadAvg(); err == nil {
		return load[0], load[1], load[2]
	}
	approx := cpuPct / 100.0 * float64(cores)
	return approx, approx, approx
}

// ── Battery ───────────────────────────────────────────────────────────────────

func collectBattery() *BatteryInfo {
	bat, err := getBattery()
	if err != nil || bat == nil {
		return nil
	}
	return bat
}

// ── Docker ────────────────────────────────────────────────────────────────────

func collectDocker() []DockerContainer {
	return runDockerCollect()
}

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	gib = 1073741824.0
	mib = 1048576.0
)

func round1(f float64) float64 { return math.Round(f*10) / 10 }
func round2(f float64) float64 { return math.Round(f*100) / 100 }
func round3(f float64) float64 { return math.Round(f*1000) / 1000 }

func deltaUint64(cur, prev uint64) uint64 {
	if cur < prev {
		return 0
	}
	return cur - prev
}
