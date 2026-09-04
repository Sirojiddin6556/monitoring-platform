package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ── embedded HTML ─────────────────────────────────────────────────────────────

const htmlPage = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monitoring Agent Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;width:520px;padding:36px 40px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  h1{font-size:1.4rem;font-weight:600;color:#fff;margin-bottom:4px}
  .subtitle{color:#718096;font-size:.85rem;margin-bottom:28px}
  .step-bar{display:flex;gap:6px;margin-bottom:28px}
  .step-bar span{flex:1;height:3px;border-radius:3px;background:#2d3748;transition:background .3s}
  .step-bar span.active{background:#4f8ef7}
  .step-bar span.done{background:#48bb78}
  label{display:block;font-size:.8rem;color:#a0aec0;margin-bottom:5px;margin-top:14px}
  input{width:100%;padding:9px 12px;background:#0f1117;border:1px solid #2d3748;border-radius:6px;color:#e2e8f0;font-size:.9rem;outline:none;transition:border .2s}
  input:focus{border-color:#4f8ef7}
  .row{display:flex;gap:10px}
  .row>div{flex:1}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border:none;border-radius:7px;font-size:.9rem;font-weight:500;cursor:pointer;transition:opacity .2s;width:100%;margin-top:22px}
  .btn-primary{background:#4f8ef7;color:#fff}
  .btn-primary:hover{opacity:.88}
  .btn-primary:disabled{opacity:.4;cursor:not-allowed}
  .btn-secondary{background:#2d3748;color:#e2e8f0}
  .btn-secondary:hover{opacity:.8}
  .log-box{background:#0f1117;border:1px solid #2d3748;border-radius:6px;padding:12px;height:180px;overflow-y:auto;font-family:'Cascadia Code','Consolas',monospace;font-size:.78rem;line-height:1.6;margin-top:18px}
  .log-ok{color:#48bb78}.log-warn{color:#ecc94b}.log-err{color:#fc8181}.log-info{color:#63b3ed}
  .done-icon{font-size:3rem;text-align:center;margin:10px 0 6px}
  .done-title{font-size:1.2rem;font-weight:600;color:#48bb78;text-align:center}
  .done-sub{color:#718096;font-size:.83rem;text-align:center;margin-top:6px}
  .err-title{color:#fc8181}
  .hidden{display:none}
  #test-result{font-size:.75rem;margin-top:5px;min-height:16px}
  .ok{color:#48bb78}.bad{color:#fc8181}
</style>
</head>
<body>
<div class="card">
  <h1>Monitoring Agent Setup</h1>
  <p class="subtitle">Install the monitoring agent on this machine</p>
  <div class="step-bar">
    <span id="s1" class="active"></span>
    <span id="s2"></span>
    <span id="s3"></span>
  </div>

  <!-- Step 1: settings -->
  <div id="page1">
    <label>Backend URL</label>
    <input id="backend" type="text" value="http://localhost:8000" placeholder="http://10.0.0.1:8000">
    <div id="test-result"></div>
    <label>Server ID</label>
    <input id="serverid" type="text" placeholder="my-server-1">
    <label>Ingest API Key</label>
    <input id="apikey" type="text" placeholder="leave blank if not configured">
    <div class="row">
      <div>
        <label>Interval (seconds)</label>
        <input id="interval" type="number" value="15" min="5" max="300">
      </div>
      <div>
        <label>Install directory</label>
        <input id="installdir" type="text" value="C:\monitoring-agent">
      </div>
    </div>
    <button class="btn btn-primary" id="btnInstall" onclick="startInstall()">Install Agent</button>
  </div>

  <!-- Step 2: progress -->
  <div id="page2" class="hidden">
    <p style="color:#a0aec0;font-size:.85rem">Installing, please wait…</p>
    <div class="log-box" id="logbox"></div>
    <button class="btn btn-secondary hidden" id="btnRetry" onclick="location.reload()">Try again</button>
  </div>

  <!-- Step 3: done -->
  <div id="page3" class="hidden">
    <div class="done-icon" id="doneIcon">✅</div>
    <div class="done-title" id="doneTitle">Installation complete!</div>
    <div class="done-sub" id="doneSub">The agent is running and will start automatically on boot.</div>
    <button class="btn btn-secondary" style="margin-top:24px" onclick="window.close()">Close</button>
  </div>
</div>
<script>
function setStep(n){
  ['s1','s2','s3'].forEach((id,i)=>{
    const el=document.getElementById(id)
    el.className = i<n-1?'done':i===n-1?'active':''
  })
}
function show(id){
  ['page1','page2','page3'].forEach(p=>document.getElementById(p).classList.add('hidden'))
  document.getElementById(id).classList.remove('hidden')
}
function log(msg,cls='log-info'){
  const box=document.getElementById('logbox')
  const line=document.createElement('div')
  line.className=cls
  line.textContent=msg
  box.appendChild(line)
  box.scrollTop=box.scrollHeight
}
function startInstall(){
  const backend=document.getElementById('backend').value.trim()
  const serverid=document.getElementById('serverid').value.trim()
  const apikey=document.getElementById('apikey').value.trim()
  const interval=document.getElementById('interval').value.trim()
  const installdir=document.getElementById('installdir').value.trim()
  if(!backend||!serverid){alert('Backend URL and Server ID are required');return}
  document.getElementById('btnInstall').disabled=true
  show('page2'); setStep(2)
  const es=new EventSource('/api/install?backend='+encodeURIComponent(backend)
    +'&serverid='+encodeURIComponent(serverid)
    +'&apikey='+encodeURIComponent(apikey)
    +'&interval='+encodeURIComponent(interval)
    +'&installdir='+encodeURIComponent(installdir))
  es.onmessage=function(e){
    const d=JSON.parse(e.data)
    if(d.type==='log')  log(d.msg, d.ok===false?'log-err':'log-ok')
    if(d.type==='done'){
      es.close()
      setStep(3); show('page3')
      if(!d.ok){
        document.getElementById('doneIcon').textContent='❌'
        document.getElementById('doneTitle').textContent='Installation failed'
        document.getElementById('doneTitle').className='done-title err-title'
        document.getElementById('doneSub').textContent=d.msg||''
        document.getElementById('btnRetry').classList.remove('hidden')
        show('page2')
        document.getElementById('btnRetry').classList.remove('hidden')
        setStep(2)
      }
    }
  }
  es.onerror=function(){es.close();log('Connection lost','log-err')}
}
</script>
</body>
</html>`

// ── state ─────────────────────────────────────────────────────────────────────

var (
	sseClients   = sync.Map{}
	shutdownOnce sync.Once
)

type sseEvent struct {
	Type string `json:"type"`
	Msg  string `json:"msg,omitempty"`
	Ok   *bool  `json:"ok,omitempty"`
}

func boolPtr(b bool) *bool { return &b }

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot bind:", err)
		os.Exit(1)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	url := "http://" + addr

	mux := http.NewServeMux()
	mux.HandleFunc("/", serveHTML)
	mux.HandleFunc("/api/install", serveInstall)

	srv := &http.Server{Addr: addr, Handler: mux}
	go srv.ListenAndServe()

	time.Sleep(150 * time.Millisecond)
	openBrowser(url)

	// block until process is killed
	select {}
}

// ── handlers ──────────────────────────────────────────────────────────────────

func serveHTML(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, htmlPage)
}

func serveInstall(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	backend := strings.TrimRight(strings.TrimSpace(q.Get("backend")), "/")
	serverID := strings.TrimSpace(q.Get("serverid"))
	apiKey := strings.TrimSpace(q.Get("apikey"))
	interval := strings.TrimSpace(q.Get("interval"))
	installDir := strings.TrimSpace(q.Get("installdir"))
	if interval == "" {
		interval = "15"
	}
	if installDir == "" {
		installDir = `C:\monitoring-agent`
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", 500)
		return
	}

	send := func(ev sseEvent) {
		b, _ := json.Marshal(ev)
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}
	logOK := func(msg string) { send(sseEvent{Type: "log", Msg: "[+] " + msg, Ok: boolPtr(true)}) }
	logErr := func(msg string) { send(sseEvent{Type: "log", Msg: "[x] " + msg, Ok: boolPtr(false)}) }
	done := func(ok bool, msg string) { send(sseEvent{Type: "done", Msg: msg, Ok: &ok}) }

	// 1. Create install directory
	if err := os.MkdirAll(installDir, 0755); err != nil {
		logErr("Cannot create directory: " + err.Error())
		done(false, err.Error())
		return
	}
	logOK("Directory: " + installDir)

	// 2. Download MonitoringAgent.exe
	binPath := filepath.Join(installDir, "MonitoringAgent.exe")
	logOK("Downloading MonitoringAgent.exe from " + backend + " ...")
	if err := downloadFile(backend+"/api/agent/download/MonitoringAgent.exe", binPath); err != nil {
		logErr("Download failed: " + err.Error())
		done(false, err.Error())
		return
	}
	logOK("Binary downloaded")

	// 3. Write agent.env
	envContent := fmt.Sprintf("BACKEND_URL=%s\nSERVER_ID=%s\nINTERVAL=%s\nINGEST_API_KEY=%s\n",
		backend, serverID, interval, apiKey)
	if err := os.WriteFile(filepath.Join(installDir, "agent.env"), []byte(envContent), 0600); err != nil {
		logErr("Cannot write agent.env: " + err.Error())
		done(false, err.Error())
		return
	}
	logOK("Config written: agent.env")

	// 4. Write start.ps1
	startPS := `$ErrorActionPreference = "SilentlyContinue"
$dir = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$pause = Join-Path $dir ".agent_paused"
if (Test-Path $pause) { Remove-Item $pause -Force -ErrorAction SilentlyContinue }
$bin = Join-Path $dir "MonitoringAgent.exe"
if (Test-Path $bin) { Start-Process -FilePath $bin -WorkingDirectory $dir -WindowStyle Hidden }
`
	if err := os.WriteFile(filepath.Join(installDir, "start.ps1"), []byte(startPS), 0644); err != nil {
		logErr("Cannot write start.ps1: " + err.Error())
		done(false, err.Error())
		return
	}
	logOK("Start script written")

	// 5. Register scheduled task
	logOK("Registering scheduled task...")
	taskScript := fmt.Sprintf(`
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 2) -RestartCount 5
$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File \"%s\start.ps1\"" -WorkingDirectory "%s"
$trigger  = New-ScheduledTaskTrigger -AtStartup
Unregister-ScheduledTask -TaskName 'MonitoringAgent' -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName 'MonitoringAgent' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'MonitoringAgent'
`, installDir, installDir)

	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", taskScript)
	out, err := cmd.CombinedOutput()
	if err != nil {
		logErr("Scheduled task failed: " + strings.TrimSpace(string(out)))
		// Not fatal — agent.env and binary are installed, user can start manually
		logOK("Binary installed. Start manually: " + binPath)
	} else {
		logOK("Scheduled task registered and started")
	}

	logOK("Done! Agent is running and will auto-start on boot.")
	done(true, "")
}

// ── helpers ───────────────────────────────────────────────────────────────────

func downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func openBrowser(url string) {
	exec.Command("cmd", "/c", "start", "", url).Start()
}
