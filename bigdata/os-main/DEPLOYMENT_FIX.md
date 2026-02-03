# EventStore JSON Corruption Fix - Deployment Guide

## Problem
The server is experiencing JSON parse errors in `events.meta.json` due to concurrent writes from multiple events (POS, KDS, job orders).

## Fix Applied
The fix has been committed to branch: `claude/fix-eventstore-json-parse-01DqvmU7nEL6LumcYtqAUm11`

**Changes in `src/eventStore.js`:**
1. ✅ Atomic writes to prevent race conditions
2. ✅ Auto-recovery from corrupted files

## Deployment Steps

### 1. Pull the latest code
```bash
cd /root/gptflask/os
git fetch origin
git checkout claude/fix-eventstore-json-parse-01DqvmU7nEL6LumcYtqAUm11
git pull origin claude/fix-eventstore-json-parse-01DqvmU7nEL6LumcYtqAUm11
```

### 2. Verify the changes
```bash
git log -1 --oneline
# Should show: FIX: Prevent eventStore.js JSON corruption from concurrent writes

git diff origin/main src/eventStore.js | head -50
# Should show atomic write implementation
```

### 3. Restart the Node.js server
```bash
# Find the process
ps aux | grep node

# Stop the current process (replace PID)
# Option 1: Using pm2 (if available)
pm2 restart all

# Option 2: Using systemd (if service is configured)
sudo systemctl restart mishkah-os

# Option 3: Manual kill and restart
kill -15 <PID>  # Graceful shutdown
# Then start your server again
```

### 4. Monitor for recovery
The fix will automatically:
- Detect corrupted `events.meta.json` files
- Back them up with timestamp
- Rebuild metadata from `events.log`
- Continue normal operation

**Watch the logs:**
```bash
# Monitor for recovery messages
journalctl -u mishkah-os -f | grep -E 'CORRUPTED|Recovered|rebuilt'

# Or tail your log file
tail -f /var/log/your-app.log | grep -E 'eventStore|CORRUPTED'
```

### 5. Verify the fix is working
After restart, you should see:
- ✅ No more "Unexpected token" JSON parse errors
- ✅ If any corrupted files exist, you'll see recovery messages
- ✅ New backup files: `*.corrupted.*.bak` (if recovery occurred)

### 6. Cleanup (Optional)
After confirming the fix works:
```bash
# Remove debug logging if needed
# Check for any .corrupted.*.bak files
find /root/gptflask/os/data -name "*.corrupted.*.bak"

# Archive them for investigation
mkdir -p ~/corrupted_files_backup
mv /root/gptflask/os/data/branches/*/modules/*/live/*.corrupted.*.bak ~/corrupted_files_backup/ 2>/dev/null
```

## What Changed

### Before (BROKEN):
```javascript
async function writeMeta(context, meta) {
  await writeFile(context.metaPath, JSON.stringify(meta, null, 2), 'utf8');
  // ❌ Direct write - multiple processes can corrupt the file
}
```

### After (FIXED):
```javascript
async function writeMeta(context, meta) {
  const tempPath = `${context.metaPath}.tmp.${Date.now()}.${Math.random()}`;
  const content = JSON.stringify(meta, null, 2);

  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, context.metaPath);  // ✅ Atomic operation
}
```

## Merge to Main (After Testing)

Once confirmed working in production:
```bash
git checkout main
git merge claude/fix-eventstore-json-parse-01DqvmU7nEL6LumcYtqAUm11
git push origin main
```

---

## Emergency Rollback
If issues occur:
```bash
git checkout main
git pull origin main
# Restart server
pm2 restart all  # or your restart command
```
