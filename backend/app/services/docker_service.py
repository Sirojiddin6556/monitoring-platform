"""Docker Service: Domain logic for Docker container inspection and statistics across all nodes."""
from typing import Dict, Any, List
from ..core.state import SERVERS, AGENT_METRICS

class DockerService:
    @staticmethod
    def get_all_containers() -> Dict[str, Any]:
        """Collect aggregated list of containers across all monitored servers."""
        result: List[Dict[str, Any]] = []
        for s in SERVERS:
            agent = AGENT_METRICS.get(s['id'])
            if not agent:
                continue
            containers = agent.get('docker_containers')
            if not containers:
                continue
            for c in containers:
                result.append({**c, 'server_id': s['id'], 'server_name': s.get('name', s['id'])})
        return {'containers': result, 'total': len(result)}

    @staticmethod
    def get_stats() -> Dict[str, Any]:
        """Aggregate Docker status metrics across all servers."""
        total = 0
        running = 0
        stopped = 0
        servers_with_docker = 0
        for s in SERVERS:
            agent = AGENT_METRICS.get(s['id'])
            if not agent:
                continue
            containers = agent.get('docker_containers')
            if containers is not None:
                servers_with_docker += 1
                for c in containers:
                    total += 1
                    if c.get('status') == 'running':
                        running += 1
                    else:
                        stopped += 1
        return {
            'total': total,
            'running': running,
            'stopped': stopped,
            'servers_with_docker': servers_with_docker
        }
