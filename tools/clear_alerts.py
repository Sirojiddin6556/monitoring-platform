import sqlite3
conn = sqlite3.connect('data/monitoring.db')
c = conn.cursor()

# Delete docker alerts (no docker installed)
c.execute("DELETE FROM alerts WHERE category='docker'")
print('Deleted docker alerts:', c.rowcount)

# Delete old stale alerts for srv-1 (server removed)
c.execute("DELETE FROM alerts WHERE target_id LIKE 'srv-1:%' OR target_id='srv-1'")
print('Deleted srv-1 alerts:', c.rowcount)

# Delete service alerts
c.execute("DELETE FROM alerts WHERE category='service'")
print('Deleted service alerts:', c.rowcount)

c.execute("SELECT COUNT(*) FROM alerts")
print('Total remaining:', c.fetchone()[0])
c.execute("SELECT COUNT(*) FROM alerts WHERE is_active=1")
print('Active remaining:', c.fetchone()[0])

conn.commit()
conn.close()
