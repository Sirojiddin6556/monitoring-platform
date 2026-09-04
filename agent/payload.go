package main

// MetricValue represents a single numeric metric with unit.
type MetricValue struct {
	Value float64 `json:"value"`
	Unit  string  `json:"unit"`
}

type Metrics struct {
	CPU         MetricValue `json:"cpu"`
	RAM         MetricValue `json:"ram"`
	Disk        MetricValue `json:"disk"`
	Swap        MetricValue `json:"swap"`
	NetIn       MetricValue `json:"net_in"`
	NetOut      MetricValue `json:"net_out"`
	Load1       MetricValue `json:"load1"`
	Load5       MetricValue `json:"load5"`
	Load15      MetricValue `json:"load15"`
	Processes   MetricValue `json:"processes"`
	UptimeHours MetricValue `json:"uptime_hours"`
	IOPSRead    MetricValue `json:"iops_read"`
	IOPSWrite   MetricValue `json:"iops_write"`
}

type CPUDetail struct {
	Percent       float64   `json:"percent"`
	CoresLogical  int       `json:"cores_logical"`
	CoresPhysical int       `json:"cores_physical"`
	FreqMHz       float64   `json:"freq_mhz"`
	FreqMin       float64   `json:"freq_min"`
	FreqMax       float64   `json:"freq_max"`
	PerCore       []float64 `json:"per_core"`
	User          float64   `json:"user"`
	System        float64   `json:"system"`
	Idle          float64   `json:"idle"`
	IOWait        float64   `json:"iowait"`
	CtxSwitches   int64     `json:"ctx_switches"`
	Interrupts    int64     `json:"interrupts"`
}

type RAMDetail struct {
	TotalGB     float64 `json:"total_gb"`
	UsedGB      float64 `json:"used_gb"`
	AvailableGB float64 `json:"available_gb"`
	FreeGB      float64 `json:"free_gb"`
	CachedGB    float64 `json:"cached_gb"`
	BuffersGB   float64 `json:"buffers_gb"`
	Percent     float64 `json:"percent"`
}

type SwapDetail struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	Percent float64 `json:"percent"`
}

type DiskPartition struct {
	Device     string  `json:"device"`
	Mountpoint string  `json:"mountpoint"`
	Fstype     string  `json:"fstype"`
	TotalGB    float64 `json:"total_gb"`
	UsedGB     float64 `json:"used_gb"`
	FreeGB     float64 `json:"free_gb"`
	Percent    float64 `json:"percent"`
}

type DiskIO struct {
	ReadMBs   float64 `json:"read_mb_s"`
	WriteMBs  float64 `json:"write_mb_s"`
	IOPSRead  float64 `json:"iops_read"`
	IOPSWrite float64 `json:"iops_write"`
}

type NetworkInterface struct {
	Name         string  `json:"name"`
	SpeedInMbps  float64 `json:"speed_in_mbps"`
	SpeedOutMbps float64 `json:"speed_out_mbps"`
	BytesRecv    uint64  `json:"bytes_recv"`
	BytesSent    uint64  `json:"bytes_sent"`
	ErrorsIn     int64   `json:"errors_in"`
	ErrorsOut    int64   `json:"errors_out"`
	DropsIn      int64   `json:"drops_in"`
	DropsOut     int64   `json:"drops_out"`
}

type NetworkConnections struct {
	Total    int            `json:"total"`
	ByStatus map[string]int `json:"by_status"`
}

type SystemInfo struct {
	OS           string  `json:"os"`
	OSVersion    string  `json:"os_version"`
	Kernel       string  `json:"kernel"`
	Hostname     string  `json:"hostname"`
	Architecture string  `json:"architecture"`
	BootTime     string  `json:"boot_time"`
	UptimeHours  float64 `json:"uptime_hours"`
}

type ProcessEntry struct {
	PID    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	RAMMb  float64 `json:"ram_mb"`
	Status string  `json:"status"`
	User   string  `json:"user"`
}

type ProcessesDetail struct {
	Total  int            `json:"total"`
	Zombie int            `json:"zombie"`
	TopCPU []ProcessEntry `json:"top_cpu"`
	TopRAM []ProcessEntry `json:"top_ram"`
}

type ServiceEntry struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Status      string `json:"status"`
	StartType   string `json:"start_type"`
}

type DockerContainer struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Image      string  `json:"image"`
	Status     string  `json:"status"`
	CPUPercent float64 `json:"cpu_percent"`
	MemMb      float64 `json:"mem_mb"`
	MemPercent float64 `json:"mem_percent"`
}

type VMEntry struct {
	Name  string `json:"name"`
	State string `json:"state"`
	Type  string `json:"type"`
}

type SecurityInfo struct {
	OpenPorts         []int `json:"open_ports"`
	ActiveSSHSessions int   `json:"active_ssh_sessions"`
	ActiveUsers       int   `json:"active_users"`
	ActiveVPNSessions int   `json:"active_vpn_sessions"`
	FailedLogins24h   int   `json:"failed_logins_24h"`
}

type Temperature struct {
	Sensor   string  `json:"sensor"`
	Label    string  `json:"label"`
	Current  float64 `json:"current"`
	High     float64 `json:"high"`
	Critical float64 `json:"critical"`
}

type BatteryInfo struct {
	Percent     float64 `json:"percent"`
	PowerPlugged bool   `json:"power_plugged"`
	SecsLeft    int64   `json:"secs_left"`
}

type RecentLogs struct {
	System []string `json:"system"`
	Auth   []string `json:"auth"`
	Error  []string `json:"error"`
}

type AgentSelf struct {
	PID        int     `json:"pid"`
	MemoryMb   float64 `json:"memory_mb"`
	LastSendMs float64 `json:"last_send_ms"`
	BufferLen  int     `json:"buffer_len"`
}

type WebMetrics struct {
	RPS     float64 `json:"rps"`
	HTTP2xx int     `json:"http_2xx"`
	HTTP3xx int     `json:"http_3xx"`
	HTTP4xx int     `json:"http_4xx"`
	HTTP5xx int     `json:"http_5xx"`
}

type Payload struct {
	Service      string  `json:"service"`
	AgentVersion string  `json:"agent_version"`
	Timestamp    int64   `json:"timestamp"`
	ServerID     string  `json:"server_id"`
	Metric       string  `json:"metric"`
	Status       string  `json:"status"`
	Warmup       bool    `json:"warmup"`

	Metrics             Metrics              `json:"metrics"`
	SystemInfo          SystemInfo           `json:"system_info"`
	CPUDetail           CPUDetail            `json:"cpu_detail"`
	RAMDetail           RAMDetail            `json:"ram_detail"`
	SwapDetail          SwapDetail           `json:"swap_detail"`
	Disks               []DiskPartition      `json:"disks"`
	DiskIO              DiskIO               `json:"disk_io"`
	NetworkInterfaces   []NetworkInterface   `json:"network_interfaces"`
	NetworkConnections  NetworkConnections   `json:"network_connections"`
	ProcessesDetail     ProcessesDetail      `json:"processes_detail"`
	Services            []ServiceEntry       `json:"services"`
	DockerContainers    []DockerContainer    `json:"docker_containers"`
	VirtualMachines     []VMEntry            `json:"virtual_machines"`
	RecentLogs          RecentLogs           `json:"recent_logs"`
	Security            SecurityInfo         `json:"security"`
	Temperatures        []Temperature        `json:"temperatures"`
	Battery             *BatteryInfo         `json:"battery"`
	WebMetrics          *WebMetrics          `json:"web_metrics,omitempty"`
	AgentSelf           AgentSelf            `json:"agent_self"`
	Databases           []DBStatus           `json:"databases"`
	NetworkEquipment    []NetEquipStatus     `json:"network_equipment"`
	SSLCertificates     []SSLCertStatus      `json:"ssl_certificates"`
}

type DBStatus struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	Status    string  `json:"status"`
	LatencyMs float64 `json:"latency_ms"`
}

type NetEquipStatus struct {
	Name      string  `json:"name"`
	IP        string  `json:"ip"`
	Status    string  `json:"status"`
	LatencyMs float64 `json:"latency_ms"`
}

type SSLCertStatus struct {
	Domain    string `json:"domain"`
	Status    string `json:"status"`
	DaysLeft  int    `json:"days_left"`
	Issuer    string `json:"issuer"`
	ExpiresAt string `json:"expires_at"`
}
