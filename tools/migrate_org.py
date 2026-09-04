import sqlite3
conn = sqlite3.connect('backend/data/monitoring.db')
c = conn.cursor()

def add_column_if_missing(table, col, col_type='TEXT'):
    c.execute(f'PRAGMA table_info({table})')
    cols = [row[1] for row in c.fetchall()]
    if col not in cols:
        c.execute(f'ALTER TABLE {table} ADD COLUMN {col} {col_type}')
        print(f'  Added {col} to {table}')

# Servers table
print('Checking servers...')
for col in ['org_id', 'monitor_type', 'ssh_user', 'ssh_port', 'ssh_password', 'ssh_key_path', 'winrm_user', 'winrm_password', 'winrm_port', 'winrm_use_ssl']:
    col_type = 'INTEGER' if col in ('org_id', 'ssh_port', 'winrm_port') else 'TEXT'
    if col == 'winrm_use_ssl':
        col_type = 'BOOLEAN'
    add_column_if_missing('servers', col, col_type)

# Websites table
print('Checking websites...')
add_column_if_missing('websites', 'org_id', 'INTEGER')

# Verify
c.execute('PRAGMA table_info(servers)')
print('servers columns:', [row[1] for row in c.fetchall()])
c.execute('PRAGMA table_info(websites)')
print('websites columns:', [row[1] for row in c.fetchall()])

conn.commit()
conn.close()
print('Done')
