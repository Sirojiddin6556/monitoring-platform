import os
import asyncio
import httpx
import time
import socket
import json
from prometheus_client import Counter, start_http_server
from pythonjsonlogger import jsonlogger
import logging

BACKEND_URL = os.getenv('BACKEND_URL', 'http://backend:8000')
LOGSTASH_HOST = os.getenv('LOGSTASH_HOST', 'logstash')
LOGSTASH_PORT = int(os.getenv('LOGSTASH_PORT', '5044'))
TARGET = os.getenv('TARGET_URL', 'https://example.com')
METRICS_PORT = int(os.getenv('METRICS_PORT', '8002'))

# Prometheus metrics
PROBES_TOTAL = Counter('prober_probes_total', 'Number of probes executed')
PROBES_FAIL = Counter('prober_probes_failed_total', 'Number of failed probes')
SENT_PROBES = Counter('prober_sent_probes_total', 'Number of probe results sent to backend')
SENT_LOGS = Counter('prober_sent_logs_total', 'Number of logs sent to Logstash')

# JSON logger
logger = logging.getLogger('prober')
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter('%(asctime)s %(name)s %(levelname)s %(message)s')
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)


def send_log_to_logstash(payload: dict):
    try:
        # POST to backend /api/logs
        httpx.post(f"{BACKEND_URL}/api/logs", json=payload, timeout=5)
        SENT_LOGS.inc()
    except Exception as e:
        logger.warning({'msg': 'failed to send log to backend', 'error': str(e)})


async def probe_once(session):
    PROBES_TOTAL.inc()
    result = {'target': TARGET, 'status': 'down', 'status_code': None, 'timestamp': int(time.time())}
    try:
        r = await session.get(TARGET, timeout=10)
        result['status'] = 'up' if r.status_code < 400 else 'degraded'
        result['status_code'] = r.status_code
        try:
            # httpx.Response.elapsed is a timedelta
            result['response_time'] = r.elapsed.total_seconds() if hasattr(r, 'elapsed') and r.elapsed is not None else None
        except Exception:
            result['response_time'] = None
    except Exception as e:
        PROBES_FAIL.inc()
        logger.warning({'msg': 'probe_failed', 'error': str(e), 'target': TARGET})
        send_log_to_logstash({'level': 'warning', 'message': 'probe_failed', 'error': str(e), 'target': TARGET})
    try:
        await session.post(f"{BACKEND_URL}/api/probe", json=result, timeout=5)
        SENT_PROBES.inc()
    except Exception as e:
        logger.warning({'msg': 'failed to post probe', 'error': str(e)})
        send_log_to_logstash({'level': 'warning', 'message': 'failed to post probe', 'error': str(e), 'payload': result})


async def loop():
    # start prometheus metrics HTTP server
    start_http_server(METRICS_PORT)
    async with httpx.AsyncClient() as client:
        while True:
            await probe_once(client)
            await asyncio.sleep(30)


if __name__ == '__main__':
    logger.info({'msg': 'prober starting', 'backend': BACKEND_URL, 'logstash': f"{LOGSTASH_HOST}:{LOGSTASH_PORT}", 'target': TARGET, 'metrics_port': METRICS_PORT})
    try:
        asyncio.run(loop())
    except KeyboardInterrupt:
        logger.info({'msg': 'prober stopping'})
