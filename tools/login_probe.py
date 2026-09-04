import time
import httpx

ok = 0
fail = 0
with httpx.Client(timeout=5.0) as c:
    for _ in range(8):
        try:
            r = c.post('http://127.0.0.1:8000/api/auth/login', json={'email': 'admin@example.com', 'password': 'admin123'})
            if r.status_code == 200:
                ok += 1
            else:
                fail += 1
        except Exception:
            fail += 1
        time.sleep(0.4)
print({'login_ok': ok, 'login_fail': fail})
