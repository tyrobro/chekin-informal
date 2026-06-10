import subprocess
import sys

results = []

# Try connecting with 'ayush' user
r = subprocess.run(
    ['psql', '-h', '127.0.0.1', '-U', 'ayush', '-c', 'SELECT version();'],
    capture_output=True, text=True, timeout=10
)
results.append(f"psql ayush RC={r.returncode}")
results.append(f"STDOUT: {r.stdout[:300]}")
results.append(f"STDERR: {r.stderr[:300]}")

# Try with postgres user
r2 = subprocess.run(
    ['psql', '-h', '127.0.0.1', '-U', 'postgres', '-c', 'SELECT version();'],
    capture_output=True, text=True, timeout=10
)
results.append(f"psql postgres RC={r2.returncode}")
results.append(f"STDOUT: {r2.stdout[:300]}")
results.append(f"STDERR: {r2.stderr[:300]}")

# Write to file
with open('/home/ayush/Foundership/ChekInExplara/pg_check_result.txt', 'w') as f:
    f.write('\n'.join(results))
