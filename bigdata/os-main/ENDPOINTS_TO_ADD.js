// Auto-Login and Table Sync Endpoints
// Add these endpoints to server.js before the final closing braces

// ========== AUTO-LOGIN ENDPOINT ==========
// Location: Add before httpServer.listen() or before the last closing braces

/*
if (url.pathname === '/api/autologin' && req.method === 'GET') {
  try {
    const encToken = url.searchParams.get('enc');
    const redirectUrl = url.searchParams.get('url') || '/';
    
    if (!encToken) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>400 Bad Request</h1><p>Missing encrypted token</p></body></html>');
      return;
    }

    let branchConfig =null;
    for (const [branchId, config] of Object.entries(BRANCH_DOMAINS)) {
      branchConfig = config;
      break;
    }

    if (!branchConfig || !branchConfig.domain_url) {
      logger.error('No branch domain configuration found');
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>500 Internal Error</h1><p>Configuration missing</p></body></html>');
      return;
    }

    const decryptUrl = `${branchConfig.domain_url}/api/v6/userdatadec?enc=${encodeURIComponent(encToken)}`;
    const decryptResponse = await fetch(decryptUrl, {
      method: 'GET',
      headers: { 'X-API-KEY': branchConfig.api_key }
    });

    if (!decryptResponse.ok) {
      logger.warn({ status: decryptResponse.status }, 'Token decryption failed');
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>401 Unauthorized</h1><p>Invalid token</p></body></html>');
      return;
    }

    const userData = await decryptResponse.json();

    if (userData.error) {
      logger.warn({ error: userData.error }, 'Token validation failed');
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<html><body><h1>401 Unauthorized</h1><p>${userData.error}</p></body></html>`);
      return;
    }

    if (userData.time) {
      const tokenTime = new Date(userData.time);
      const now = new Date();
      const diffSeconds = Math.abs((now - tokenTime) / 1000);
      
      if (diffSeconds > 60) {
        logger.warn({ diffSeconds }, 'Token expired');
        res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>401 Unauthorized</h1><p>Token expired</p></body></html>');
        return;
      }
    }

    const sessionToken = createId('sess');
    SESSIONS.set(sessionToken, {
      userId: userData.userID || userData.userId,
      companyId: userData.compid || userData.companyId,
      branchId: userData.branch_id || userData.branchId,
      userName: userData.userName,
      userEmail: userData.userEmail,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS
    });

    logger.info({ userId: userData.userID || userData.userId, userName: userData.userName }, 'Auto-login successful');

    res.writeHead(302, {
      'Location': redirectUrl,
      'Set-Cookie': `ws_session=${sessionToken}; Path=/; HttpOnly; Max-Age=${SESSION_TTL_MS / 1000}`,
      'content-type': 'text/html; charset=utf-8'
    });
    res.end('<html><body>Redirecting...</body></html>');
    return;

  } catch (error) {
    logger.error({ err: error }, 'Auto-login error');
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>500 Internal Error</h1><p>Login failed</p></body></html>');
    return;
  }
}

// ========== TABLE SYNC ENDPOINT ==========

if (url.pathname.match(/^\/api\/branches\/[^/]+\/modules\/[^/]+\/sync\/[^/]+$/) && req.method === 'POST') {
  try {
    const pathParts = url.pathname.split('/').filter(Boolean);
    const branchId = pathParts[2];
    const moduleId = pathParts[4];
    const tableName = pathParts[6];

    logger.info({ branchId, moduleId, tableName }, 'Starting table sync');

    const branchConfig = BRANCH_DOMAINS[branchId];
    if (!branchConfig) {
      jsonResponse(res, 404, { error: 'branch-config-not-found', branchId });
      return;
    }

    const sourceUrl = `${branchConfig.domain_url}/api/v6/pos_database_view`;
    const sourceResponse = await fetch(sourceUrl, {
      method: 'GET',
      headers: { 'X-API-KEY': branchConfig.api_key }
    });

    if (!sourceResponse.ok) {
      jsonResponse(res, 502, { error: 'source-fetch-failed', status: sourceResponse.status });
      return;
    }

    const remoteData = await sourceResponse.json();
    const remoteRows = remoteData.tables ? remoteData.tables[tableName] : null;

    if (!remoteRows || !Array.isArray(remoteRows)) {
      jsonResponse(res, 404, { error: 'table-not-found-in-source', tableName });
      return;
    }

    const seedPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'seeds', 'initial.json');
    let currentSeeds = { tables: {} };
    if (await fileExists(seedPath)) {
      currentSeeds = await readJsonSafe(seedPath);
    }

    const mergedTables = { ...currentSeeds.tables };
    const localRows = mergedTables[tableName] || [];
    const merged = [...localRows];
    const localById = new Map();
    for (let i = 0; i < localRows.length; i++) {
      if (localRows[i]?.id) localById.set(localRows[i].id, i);
    }

    let updates = 0;
    let inserts = 0;

    for (const remoteRow of remoteRows) {
      if (!remoteRow?.id) continue;
      const localIndex = localById.get(remoteRow.id);
      if (localIndex !== undefined) {
        merged[localIndex] = { ...remoteRow };
        updates++;
      } else {
        merged.push({ ...remoteRow });
        inserts++;
      }
    }

    mergedTables[tableName] = merged;

    const updatedSeeds = {
      ...currentSeeds,
      tables: mergedTables,
      lastTableSync: { table: tableName, time: new Date().toISOString() }
    };

    await writeFile(seedPath, JSON.stringify(updatedSeeds, null, 2), 'utf8');

    const store = await ensureModuleStore(branchId, moduleId);
    store.reset();
    store.applySeed(updatedSeeds);
    await persistModuleStore(store);

    jsonResponse(res, 200, {
      success: true,
      message: `Table ${tableName} synced`,
      stats: { updates, inserts, total: merged.length }
    });
    return;

  } catch (error) {
    logger.error({ err: error }, 'Table sync failed');
    jsonResponse(res, 500, { error: 'sync-failed', message: error.message });
    return;
  }
}
*/
