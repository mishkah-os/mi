function randomString(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let idx = 0; idx < length; idx += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function ensurePosIdentity(global = window) {
  if (!global || !global.document) return;
  const readCookie = (name) => {
    const parts = (global.document.cookie || '').split(';');
    for (const raw of parts) {
      const entry = raw.trim();
      if (entry.startsWith(`${name}=`)) {
        return decodeURIComponent(entry.split('=').slice(1).join('='));
      }
    }
    return '';
  };
  const writeCookie = (name, value, days = 365) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 86400000);
    const payload = [
      `${name}=${encodeURIComponent(value)}`,
      'path=/',
      `expires=${expires.toUTCString()}`,
      'SameSite=Lax'
    ];
    global.document.cookie = payload.join('; ');
  };

  let userUniid = readCookie('UserUniid');
  if (!userUniid) {
    userUniid = `usr-${Date.now().toString(36)}-${randomString(6)}`;
    writeCookie('UserUniid', userUniid);
  }
  global.UserUniid = userUniid;

  let branchCookie = readCookie('UserBranshID');
  if (!branchCookie) {
    branchCookie = 'branch-mini';
    writeCookie('UserBranshID', branchCookie);
  }
  global.UserBranshID = branchCookie;
  global.POS_WS2_IDENTIFIERS = {
    userId: userUniid,
    branchId: branchCookie,
    hasBranchCookie: !!branchCookie
  };
}

function localizeText(entry, lang = 'ar') {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') {
    if (lang === 'ar' && entry.ar) return entry.ar;
    if (lang === 'en' && entry.en) return entry.en;
    const first = Object.values(entry).find((value) => typeof value === 'string' && value.trim());
    return first || '';
  }
  return String(entry);
}

function formatCurrency(amount, options = {}) {
  const currency = options.currency || 'EGP';
  const locale = options.locale || (options.lang === 'en' ? 'en-US' : 'ar-EG');
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  } catch (_err) {
    return `${Number(amount || 0).toFixed(2)} ${currency}`;
  }
}

function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function calculateTotals(lines = []) {
  const subtotal = roundCurrency(
    lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0)
  );
  return {
    subtotal,
    discount: 0,
    service: 0,
    tax: 0,
    deliveryFee: 0,
    due: subtotal
  };
}

function generateOrderId(prefix = 'ord') {
  return `${prefix}-${Date.now().toString(36)}-${randomString(6)}`;
}

function deriveMenuFromSnapshot(snapshot = {}) {
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const byCategory = new Map();
  for (const category of categories) {
    byCategory.set(category.id, { category, items: [] });
  }
  for (const item of items) {
    const bucket = byCategory.get(item.category_id) || byCategory.get(item.categoryId);
    if (bucket) {
      bucket.items.push(item);
    }
  }
  return {
    categories,
    items,
    byCategory
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}
