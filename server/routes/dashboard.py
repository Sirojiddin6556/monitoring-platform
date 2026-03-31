"""Dashboard UI and metrics API endpoints"""

from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Agent, Metric
from ..schemas import MetricOut
from ..security import get_current_user

router = APIRouter(prefix='/dashboard', tags=['dashboard'])


@router.get('/', response_class=HTMLResponse)
async def dashboard():
    """Dashboard UI"""
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Monitoring Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            
            .header {
                background: white;
                padding: 30px;
                border-radius: 10px;
                margin-bottom: 30px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .header h1 {
                color: #333;
                margin-bottom: 10px;
            }
            
            .header p {
                color: #666;
                font-size: 14px;
            }
            
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .card {
                background: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .card h3 {
                color: #333;
                margin-bottom: 15px;
                font-size: 16px;
            }
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                color: #333;
                font-size: 14px;
                font-weight: 500;
                margin-bottom: 5px;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 5px;
                font-size: 14px;
            }
            
            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: transform 0.2s;
            }
            
            .btn:hover {
                transform: translateY(-2px);
            }
            
            .chart-container {
                position: relative;
                height: 300px;
                margin-top: 15px;
            }
            
            .success {
                background: #10b981;
                color: white;
                padding: 12px;
                border-radius: 5px;
                margin-bottom: 15px;
            }
            
            .error {
                background: #ef4444;
                color: white;
                padding: 12px;
                border-radius: 5px;
                margin-bottom: 15px;
            }
            
            .loading {
                text-align: center;
                color: #666;
                padding: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 System Monitoring Dashboard</h1>
                <p>Real-time monitoring of system metrics and performance</p>
            </div>
            
            <div class="grid">
                <div class="card">
                    <h3>📝 Register Agent</h3>
                    <div id="registerMessage"></div>
                    <form id="registerForm">
                        <div class="form-group">
                            <label for="tenantId">Tenant ID:</label>
                            <input type="number" id="tenantId" required>
                        </div>
                        <div class="form-group">
                            <label for="agentId">Agent ID:</label>
                            <input type="text" id="agentId" required>
                        </div>
                        <div class="form-group">
                            <label for="hostname">Hostname:</label>
                            <input type="text" id="hostname">
                        </div>
                        <button type="submit" class="btn">Register Agent</button>
                    </form>
                </div>
                
                <div class="card">
                    <h3>🔍 View Metrics</h3>
                    <div id="metricsMessage"></div>
                    <form id="metricsForm">
                        <div class="form-group">
                            <label for="agentIdMetrics">Agent ID:</label>
                            <input type="number" id="agentIdMetrics" required>
                        </div>
                        <div class="form-group">
                            <label for="hours">Hours:</label>
                            <input type="number" id="hours" value="24" min="1">
                        </div>
                        <button type="submit" class="btn">Load Metrics</button>
                    </form>
                </div>
            </div>
            
            <div class="card">
                <h3>📈 Metrics Chart</h3>
                <div class="loading" id="chartLoading" style="display: none;">Loading data...</div>
                <div class="chart-container" id="chartContainer" style="display: none;">
                    <canvas id="metricsChart"></canvas>
                </div>
            </div>
        </div>
        
        <script>
            let chart = null;
            
            document.getElementById('registerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const tenantId = document.getElementById('tenantId').value;
                const agentId = document.getElementById('agentId').value;
                const hostname = document.getElementById('hostname').value;
                
                try {
                    const response = await fetch(`/agents/create?tenant_id=${tenantId}`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({agent_id: agentId, hostname: hostname})
                    });
                    
                    const messageDiv = document.getElementById('registerMessage');
                    if (response.ok) {
                        messageDiv.innerHTML = '<div class="success">✓ Agent registered successfully!</div>';
                        document.getElementById('registerForm').reset();
                    } else {
                        const error = await response.json();
                        messageDiv.innerHTML = `<div class="error">✗ Error: ${error.detail}</div>`;
                    }
                } catch (error) {
                    document.getElementById('registerMessage').innerHTML = 
                        `<div class="error">✗ Error: ${error.message}</div>`;
                }
            });
            
            document.getElementById('metricsForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const agentId = document.getElementById('agentIdMetrics').value;
                const hours = document.getElementById('hours').value;
                
                document.getElementById('chartLoading').style.display = 'block';
                document.getElementById('chartContainer').style.display = 'none';
                
                try {
                    const response = await fetch(`/dashboard/metrics/1/${agentId}?hours=${hours}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.length > 0) {
                            updateChart(data);
                        } else {
                            document.getElementById('metricsMessage').innerHTML = 
                                '<div class="error">No metrics found for this agent</div>';
                        }
                    } else {
                        document.getElementById('metricsMessage').innerHTML = 
                            '<div class="error">Error loading metrics</div>';
                    }
                } catch (error) {
                    document.getElementById('metricsMessage').innerHTML = 
                        `<div class="error">✗ Error: ${error.message}</div>`;
                } finally {
                    document.getElementById('chartLoading').style.display = 'none';
                }
            });
            
            function updateChart(data) {
                const timestamps = data.map(m => new Date(m.timestamp).toLocaleTimeString());
                const cpuData = data.map(m => m.cpu_percent || 0);
                const memoryData = data.map(m => m.memory_percent || 0);
                const diskData = data.map(m => m.disk_percent || 0);
                
                const ctx = document.getElementById('metricsChart').getContext('2d');
                
                if (chart) {
                    chart.destroy();
                }
                
                chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: timestamps,
                        datasets: [
                            {
                                label: 'CPU %',
                                data: cpuData,
                                borderColor: '#667eea',
                                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                                tension: 0.4
                            },
                            {
                                label: 'Memory %',
                                data: memoryData,
                                borderColor: '#f59e0b',
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                tension: 0.4
                            },
                            {
                                label: 'Disk %',
                                data: diskData,
                                borderColor: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top'
                            }
                        },
                        scales: {
                            y: {
                                min: 0,
                                max: 100
                            }
                        }
                    }
                });
                
                document.getElementById('chartContainer').style.display = 'block';
            }
        </script>
    </body>
    </html>
    """
    return html_content


@router.get('/metrics/{tenant_id}/{agent_id}', response_model=List[MetricOut])
async def get_dashboard_metrics(
    tenant_id: int,
    agent_id: int,
    hours: int = 24,
    db: Session = Depends(get_db)
):
    """Get metrics for dashboard charts"""
    from datetime import timedelta
    
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent not found'
        )
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    metrics = db.query(Metric).filter(
        Metric.agent_id == agent_id,
        Metric.timestamp >= cutoff_time
    ).order_by(Metric.timestamp.asc()).all()
    
    return metrics
