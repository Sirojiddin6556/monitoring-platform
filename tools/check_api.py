import httpx

token_resp = httpx.post('http://127.0.0.1:8000/api/auth/login', json={'email':'admin@example.com','password':'admin123'})
token = token_resp.json().get('access_token','')
h = {'Authorization': 'Bearer ' + token}

# Check alerts - last 5
alerts = httpx.get('http://127.0.0.1:8000/api/alerts?limit=5', headers=h).json()['alerts']
print('=== Last 5 alerts ===')
for a in alerts[:5]:
    sev = a.get('severity','?')
    title = a.get('title','?')
    active = a.get('is_active','?')
    cat = a.get('category','?')
    created = str(a.get('created_at',''))[:19]
    print(f'  [{sev}] {title} | active={active} | cat={cat} | {created}')

# Check detail data more specifically  
srv = httpx.get('http://127.0.0.1:8000/api/servers/PC-3002/detail', headers=h).json().get('detail') or {}
print()
print('=== CPU detail ===', srv.get('cpu_detail'))
print('=== RAM detail ===', srv.get('ram_detail'))
print('=== System info ===', srv.get('system_info'))
print('=== Security ===', srv.get('security'))
print()
print('=== Recent logs sample ===')
for k, v in (srv.get('recent_logs') or {}).items():
    sample = v[:1] if v else []
    print(f'  {k}: {len(v)} entries | sample: {sample}')
print()
svc_sample = (srv.get('services') or [])[:3]
print('=== Services sample ===', svc_sample)

# Check websites
print()
sites = httpx.get('http://127.0.0.1:8000/api/websites', headers=h).json().get('websites',[])
print('=== Websites ===')
for s in sites:
    lp = s.get('last_probe') or {}
    status = lp.get('status','?')
    rt = lp.get('response_time','?')
    print(f'  {s["name"]} ({s["url"]}) | status={status} rt={rt}ms')
