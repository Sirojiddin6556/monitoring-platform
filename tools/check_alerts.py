import sqlite3
c = sqlite3.connect('data/monitoring.db')
r = c.execute("SELECT COUNT(*), COUNT(CASE WHEN is_active THEN 1 END), category FROM alerts GROUP BY category").fetchall()
for row in r:
    print(f'  {str(row[2]):15s}: total={row[0]}, active={row[1]}')
total = c.execute("SELECT COUNT(*), COUNT(CASE WHEN is_active THEN 1 END) FROM alerts").fetchone()
print(f'\n  TOTAL: {total[0]}, active: {total[1]}')
c.close()
