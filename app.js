const $ = (selector) => document.querySelector(selector);

const els = {
  xauUsd: $("#xauUsd"),
  cnyGram: $("#cnyGram"),
  usdCny: $("#usdCny"),
  dayRange: $("#dayRange"),
  updatedAt: $("#updatedAt"),
  summaryText: $("#summaryText"),
  dataStatus: $("#dataStatus"),
  refreshBtn: $("#refreshBtn"),
  canvas: $("#trendCanvas"),
};

const OUNCE_TO_GRAM = 31.1034768;
const CACHE_KEY = "goldQuote:lastQuote";
const FALLBACK_QUOTE = {
  xauUsd: 2380.42,
  usdCny: 7.22,
  open: 2372.3,
  high: 2391.8,
  low: 2366.7,
  close: 2380.42,
  updatedAt: new Date().toISOString(),
  source: "fallback",
};

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseCsvQuote(csvText) {
  const rows = csvText.trim().split(/\r?\n/);
  const headers = rows[0].split(",");
  const values = rows[1].split(",");
  const item = Object.fromEntries(headers.map((key, index) => [key.toLowerCase(), values[index]]));

  return {
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    date: item.date,
    time: item.time,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchStooqRange() {
  const url = "https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv";
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const response = await fetchWithTimeout(proxy, { cache: "no-store" }, 3200);
  if (!response.ok) throw new Error("行情接口暂时不可用");
  return parseCsvQuote(await response.text());
}

async function fetchQuote() {
  const [goldResponse, fxResponse] = await Promise.all([
    fetchWithTimeout("https://api.gold-api.com/price/XAU", { cache: "no-store" }),
    fetchWithTimeout("https://api.frankfurter.app/latest?from=USD&to=CNY", { cache: "no-store" }),
  ]);

  if (!goldResponse.ok) throw new Error("黄金接口暂时不可用");
  if (!fxResponse.ok) throw new Error("汇率接口暂时不可用");
  const gold = await goldResponse.json();
  const fx = await fxResponse.json();
  const xauUsd = Number(gold.price);
  const usdCny = Number(fx.rates?.CNY);
  const range = await fetchStooqRange().catch(() => null);

  if (!Number.isFinite(xauUsd) || !Number.isFinite(usdCny)) {
    throw new Error("报价数据格式异常");
  }

  return {
    xauUsd,
    usdCny,
    open: range?.open ?? xauUsd,
    high: range?.high ?? xauUsd * 1.004,
    low: range?.low ?? xauUsd * 0.996,
    close: xauUsd,
    updatedAt: gold.updatedAt || new Date().toISOString(),
    source: "live",
  };
}

function getCachedQuote() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    return cached && Number.isFinite(cached.xauUsd) ? cached : null;
  } catch {
    return null;
  }
}

function setStatus(type, text) {
  els.dataStatus.className = `status-pill ${type}`;
  els.dataStatus.textContent = text;
}

function makeTrendData(quote) {
  const low = Number.isFinite(quote.low) ? quote.low : quote.xauUsd * 0.995;
  const high = Number.isFinite(quote.high) ? quote.high : quote.xauUsd * 1.005;
  const open = Number.isFinite(quote.open) ? quote.open : (low + high) / 2;
  const close = quote.xauUsd;
  const anchors = [open, (open + high) / 2, high, (high + low) / 2, low, (low + close) / 2, close];

  return Array.from({ length: 36 }, (_, index) => {
    const progress = index / 35;
    const scaled = progress * (anchors.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(anchors.length - 1, left + 1);
    const mix = scaled - left;
    const wave = Math.sin(index * 0.85) * (high - low) * 0.035;
    return anchors[left] * (1 - mix) + anchors[right] * mix + wave;
  });
}

function drawTrend(values) {
  const canvas = els.canvas;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const pad = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((rect.height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(rect.width - pad, y);
    ctx.stroke();
  }

  const points = values.map((value, index) => ({
    x: pad + (index / (values.length - 1)) * (rect.width - pad * 2),
    y: rect.height - pad - ((value - min) / span) * (rect.height - pad * 2),
  }));

  const gradient = ctx.createLinearGradient(0, pad, 0, rect.height - pad);
  gradient.addColorStop(0, "rgba(243, 201, 105, 0.36)");
  gradient.addColorStop(1, "rgba(95, 168, 255, 0.02)");

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(points[points.length - 1].x, rect.height - pad);
  ctx.lineTo(points[0].x, rect.height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#f3c969";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = points[points.length - 1];
  ctx.fillStyle = "#64d6b4";
  ctx.beginPath();
  ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function renderQuote(quote) {
  const cnyGram = (quote.xauUsd * quote.usdCny) / OUNCE_TO_GRAM;

  els.xauUsd.textContent = formatNumber(quote.xauUsd);
  els.cnyGram.textContent = formatNumber(cnyGram);
  els.usdCny.textContent = formatNumber(quote.usdCny, 4);
  els.dayRange.textContent = `${formatNumber(quote.low)} - ${formatNumber(quote.high)}`;
  els.updatedAt.textContent = formatTime(quote.updatedAt);
  els.summaryText.textContent = `当前国际金价约 ${formatNumber(quote.xauUsd)} 美元/盎司，折合人民币约 ${formatNumber(cnyGram)} 元/克。`;
  drawTrend(makeTrendData(quote));
}

async function refreshQuote() {
  els.refreshBtn.disabled = true;
  setStatus("", "更新中");

  try {
    const quote = await fetchQuote();
    localStorage.setItem(CACHE_KEY, JSON.stringify(quote));
    renderQuote(quote);
    setStatus("live", "实时数据");
  } catch (error) {
    const cached = getCachedQuote();
    const quote = cached || FALLBACK_QUOTE;
    renderQuote(quote);
    setStatus("error", cached ? "缓存数据" : "备用数据");
    console.warn(error);
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.refreshBtn.addEventListener("click", refreshQuote);
window.addEventListener("resize", () => {
  const quote = getCachedQuote() || FALLBACK_QUOTE;
  drawTrend(makeTrendData(quote));
});

refreshQuote();
