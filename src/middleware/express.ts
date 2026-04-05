import { RequestTracker } from '../tracker.js';
import { TrackerConfig } from '../types.js';

export function createRequestTracker(config?: Partial<TrackerConfig>) {
  const tracker = new RequestTracker(config);
  return tracker.middleware();
}

export function setupRequestTracker(app: any, config?: Partial<TrackerConfig>) {
  const tracker = new RequestTracker(config);
  app.use(tracker.middleware());

  app.get('/admin/request-tracker/stats', async (_req: any, res: any) => {
    try { res.json(await tracker.getStats()); }
    catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/admin/request-tracker/data', async (_req: any, res: any) => {
    try { res.json(await tracker.getDashboardData()); }
    catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/request-tracker', (req: any, res: any) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHtml(origin));
  });

  app.get('/admin/request-tracker/dashboard', (_req: any, res: any) => {
    res.redirect('/request-tracker');
  });

  app.get('/admin/request-tracker/recent', async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      res.json(await tracker.getRecentRequests(limit));
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/admin/request-tracker/slowest', async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      res.json(await tracker.getSlowestRequests(limit));
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/admin/request-tracker/errors', async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      res.json(await tracker.getErroredRequests(limit));
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/admin/request-tracker/network', async (req: any, res: any) => {
    try {
      res.json(await tracker.getNetworkAnalytics(req.query.path));
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/admin/request-tracker/export', async (req: any, res: any) => {
    try {
      const format = (req.query.format || 'json') as 'json' | 'csv';
      const data = await tracker.exportData(format);
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="requests.json"');
      }
      res.send(data);
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  return tracker;
}

function getDashboardHtml(origin: string): string {
  const dataUrl = `${origin}/admin/request-tracker/data`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Request Tracker Pro</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;min-height:100vh;padding:24px;color:#e2e8f0}
    .wrap{max-width:1300px;margin:0 auto;background:#1e293b;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.5);padding:36px;border:1px solid #334155}
    /* Header */
    .hdr{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px}
    .hdr h1{font-size:1.75em;font-weight:700;color:#f1f5f9;margin-bottom:4px}
    .hdr .sub{font-size:.85em;color:#94a3b8}
    .hdr .last{font-size:.75em;color:#64748b;margin-top:4px}
    .live-dot{display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:5px;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    /* Time range pills */
    .range-wrap{margin-bottom:28px}
    .range-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:8px}
    .pills{display:flex;flex-wrap:wrap;gap:6px}
    .pill{padding:5px 13px;border-radius:999px;font-size:11px;font-weight:600;border:1.5px solid #334155;background:#0f172a;color:#94a3b8;cursor:pointer;transition:all .15s}
    .pill:hover{border-color:#6366f1;color:#c7d2fe}
    .pill.active{background:#6366f1;border-color:#6366f1;color:#fff}
    /* Stats */
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:28px}
    .scard{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:18px}
    .scard .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:8px}
    .scard .val{font-size:24px;font-weight:700;color:#f1f5f9}
    .scard .hint{font-size:10px;color:#64748b;margin-top:4px;line-height:1.5}
    .scard.p95 .val{transition:color .3s}
    /* Chart */
    .chart-box{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:18px;margin-bottom:28px;height:240px;position:relative}
    .chart-title{font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em}
    /* Endpoint section */
    .sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;margin-top:28px}
    .sec-hdr h2{font-size:1em;font-weight:700;color:#f1f5f9}
    .sec-hdr .cnt{font-size:11px;color:#64748b}
    /* Search */
    .search-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
    .sinput{flex:1;min-width:180px;padding:8px 12px;background:#0f172a;border:1.5px solid #334155;border-radius:8px;font-size:12px;color:#e2e8f0;outline:none;transition:border-color .2s}
    .sinput:focus{border-color:#6366f1}
    .sinput::placeholder{color:#475569}
    .sselect{padding:8px 10px;background:#0f172a;border:1.5px solid #334155;border-radius:8px;font-size:12px;color:#e2e8f0;outline:none;cursor:pointer}
    .sselect:focus{border-color:#6366f1}
    .cbtn{padding:7px 13px;background:transparent;border:1.5px solid #334155;border-radius:8px;font-size:11px;font-weight:600;color:#94a3b8;cursor:pointer;transition:all .15s}
    .cbtn:hover{border-color:#6366f1;color:#c7d2fe}
    /* Endpoint list */
    .ep-list{border:1px solid #334155;border-radius:10px;overflow:hidden;margin-bottom:8px}
    .ep-list-hdr{display:grid;grid-template-columns:76px 1fr 72px 90px 76px 80px;gap:8px;padding:8px 14px;background:#0f172a;border-bottom:1px solid #334155;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
    .ep-grp-hdr{padding:7px 14px;background:#1a2744;border-bottom:1px solid #334155;font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.05em}
    .ep-row{display:grid;grid-template-columns:76px 1fr 72px 90px 76px 80px;gap:8px;padding:9px 14px;border-bottom:1px solid #1e293b;align-items:center;font-size:12px;transition:background .15s}
    .ep-row:hover{background:#0f172a}
    .ep-row:last-child{border-bottom:none}
    /* Tables */
    table{width:100%;border-collapse:collapse}
    th{background:#0f172a;padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#64748b;border-bottom:1.5px solid #334155;text-transform:uppercase;letter-spacing:.06em}
    td{padding:9px 12px;border-bottom:1px solid #1e293b;font-size:12px;color:#cbd5e1}
    tr:hover td{background:#0f172a40}
    .tbl-wrap{border:1px solid #334155;border-radius:10px;overflow:hidden}
    /* Badges & methods */
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
    .badge.ok{background:#14532d40;color:#4ade80}
    .badge.warn{background:#78350f40;color:#fbbf24}
    .badge.err{background:#7f1d1d40;color:#f87171}
    .mth{font-family:monospace;font-weight:700;font-size:11px}
    .GET{color:#60a5fa}.POST{color:#34d399}.PUT{color:#fbbf24}.DELETE{color:#f87171}.PATCH{color:#c084fc}
    .path-cell{font-family:monospace;font-size:11px;color:#94a3b8;word-break:break-all}
    .slow{color:#f87171;font-weight:700}
    /* More btn */
    .more-wrap{text-align:center;padding:10px}
    .more-btn{padding:6px 16px;background:transparent;border:1.5px solid #334155;border-radius:8px;font-size:11px;font-weight:600;color:#94a3b8;cursor:pointer;transition:all .15s}
    .more-btn:hover{border-color:#6366f1;color:#c7d2fe}
    .no-res{text-align:center;padding:24px;color:#475569;font-size:12px}
    /* Alert */
    .alert-err{background:#7f1d1d30;border:1px solid #f8717140;border-radius:10px;padding:14px;margin-bottom:16px;font-size:12px;color:#fca5a5}
    .loading{text-align:center;padding:60px;color:#64748b;font-size:14px}
    /* Info box */
    .info-box{background:#1e3a5f30;border:1px solid #3b82f640;border-radius:10px;padding:14px;margin-top:24px;font-size:11px;color:#93c5fd;line-height:1.9}
    code{background:#0f172a;padding:1px 6px;border-radius:4px;font-size:11px;font-family:monospace;color:#a5b4fc}
    .refresh-btn{padding:7px 16px;background:#6366f1;border:none;border-radius:8px;font-size:12px;font-weight:600;color:#fff;cursor:pointer;transition:background .15s}
    .refresh-btn:hover{background:#5254cc}
  </style>
</head>
<body>
<div class="wrap">

  <!-- Header -->
  <div class="hdr">
    <div>
      <h1>&#128202; Request Tracker Pro</h1>
      <div class="sub"><span class="live-dot"></span>Real-time HTTP Analytics &mdash; auto-refreshes every 10s</div>
      <div class="last" id="lastAccessed"></div>
    </div>
    <button class="refresh-btn" onclick="loadData()">&#8635; Refresh</button>
  </div>

  <!-- Time range -->
  <div class="range-wrap">
    <div class="range-label">Show data for last</div>
    <div class="pills" id="pills"></div>
  </div>

  <div id="alertBox" style="display:none"></div>
  <div id="loading" class="loading">Loading dashboard data&hellip;</div>

  <div id="mainContent" style="display:none">

    <!-- Stats -->
    <div class="stats" id="statsGrid">
      <div class="scard"><div class="lbl">Total Requests</div><div class="val" id="sTotal">-</div></div>
      <div class="scard"><div class="lbl">Avg Response</div><div class="val" id="sAvg">-</div><div class="hint">average time per request</div></div>
      <div class="scard p95" id="p95Card">
        <div class="lbl">P95 Latency</div>
        <div class="val" id="sP95">-</div>
        <div class="hint" id="p95Hint"></div>
        <div class="hint" style="color:#475569;margin-top:2px">95 out of 100 requests finish within this time</div>
      </div>
      <div class="scard"><div class="lbl">Error Rate</div><div class="val" id="sErr">-</div><div class="hint">4xx + 5xx responses</div></div>
      <div class="scard"><div class="lbl">Total Bandwidth</div><div class="val" id="sBw">-</div><div class="hint" id="sBwAvg"></div></div>
    </div>

    <!-- Chart -->
    <div class="chart-box">
      <div class="chart-title">Response Time — recent requests</div>
      <canvas id="latencyChart" style="height:180px"></canvas>
    </div>

    <!-- Endpoints -->
    <div class="sec-hdr">
      <h2>&#128279; API Endpoints</h2>
      <span class="cnt" id="epCount"></span>
    </div>
    <div class="search-row">
      <input id="searchInput" class="sinput" type="text" placeholder="Search path… e.g. /api/users" oninput="filterEp()">
      <select id="methodFilter" class="sselect" onchange="filterEp()">
        <option value="">All Methods</option>
        <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option>
      </select>
      <button class="cbtn" onclick="clearSearch()">Clear</button>
    </div>
    <div class="ep-list">
      <div class="ep-list-hdr">
        <span>Method</span><span>Path</span><span>Hits</span><span>Avg Latency</span><span>Errors</span><span>Bandwidth</span>
      </div>
      <div id="epRows"></div>
    </div>
    <div class="more-wrap" id="moreWrap" style="display:none">
      <button class="more-btn" id="moreBtn" onclick="toggleMore()"></button>
    </div>
    <div id="noRes" class="no-res" style="display:none">No endpoints match your search.</div>

    <!-- Recent -->
    <div class="sec-hdr" style="margin-top:32px">
      <h2>&#128337; Recent Requests</h2>
      <span class="cnt" id="recentCount"></span>
    </div>
    <div class="tbl-wrap">
      <table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Latency</th><th>Network</th></tr></thead>
      <tbody id="recentBody"></tbody></table>
    </div>

    <div class="more-wrap" id="recentMoreWrap" style="display:none">
      <button class="more-btn" id="recentMoreBtn" onclick="loadMoreRecent()"></button>
    </div>

    <!-- Slowest -->
    <div class="sec-hdr" style="margin-top:32px">
      <h2>&#128034; Slowest Requests</h2>
    </div>
    <div class="tbl-wrap">
      <table><thead><tr><th>Method</th><th>Path</th><th>Latency</th><th>Status</th></tr></thead>
      <tbody id="slowestBody"></tbody></table>
    </div>

    <div class="info-box">
      <strong>JSON API</strong><br>
      <code>/admin/request-tracker/data</code> full dashboard &nbsp;|&nbsp;
      <code>/admin/request-tracker/stats</code> stats &nbsp;|&nbsp;
      <code>/admin/request-tracker/recent</code> recent &nbsp;|&nbsp;
      <code>/admin/request-tracker/export?format=csv</code> export
    </div>
  </div>
</div>

<script>
  const DATA_URL = '${dataUrl}';
  const RANGES = [
    {l:'5 min',ms:5*60*1000},{l:'10 min',ms:10*60*1000},{l:'15 min',ms:15*60*1000},
    {l:'20 min',ms:20*60*1000},{l:'30 min',ms:30*60*1000},{l:'45 min',ms:45*60*1000},
    {l:'1 hour',ms:60*60*1000},{l:'2 hours',ms:2*60*60*1000},{l:'6 hours',ms:6*60*60*1000},
    {l:'All',ms:Infinity}
  ];
  const EP_PAGE = 7;
  const REQ_PAGE = 25;
  let rangeMs = Infinity, allData = null, allEp = [], showAll = false, chart = null, recentPage = 1;

  // Build pills
  const pillsEl = document.getElementById('pills');
  RANGES.forEach(r => {
    const b = document.createElement('button');
    b.className = 'pill' + (r.ms === Infinity ? ' active' : '');
    b.textContent = r.l;
    b.onclick = () => { rangeMs = r.ms; document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active')); b.classList.add('active'); if(allData) render(allData); };
    pillsEl.appendChild(b);
  });

  function fmt(ms){ return Math.round(ms)+'ms'; }
  function kb(b){ return (b/1024).toFixed(2)+' KB'; }
  function mb(b){ return (b/(1024*1024)).toFixed(2)+' MB'; }
  function tstr(ts){ return new Date(ts).toLocaleTimeString(); }
  function bclass(c){ return c<400?'ok':c<500?'warn':'err'; }

  function p95Label(ms){
    if(ms<=100) return 'Excellent — requests are very fast';
    if(ms<=300) return 'Good — feels instant to users';
    if(ms<=600) return 'Acceptable — most users won\\'t notice';
    if(ms<=1000) return 'Slow — some users may notice a delay';
    return 'Poor — requests taking over 1 second';
  }
  function p95Color(ms){
    if(ms<=300) return '#4ade80';
    if(ms<=600) return '#fbbf24';
    return '#f87171';
  }

  function basePath(p){
    const parts = p.split('/').filter(Boolean);
    while(parts.length>1 && /^[0-9a-f\\-]{3,}$/i.test(parts[parts.length-1])) parts.pop();
    return '/'+parts.slice(0,2).join('/');
  }

  function buildEp(reqs){
    const m={};
    for(const r of reqs){
      const k=r.method+' '+r.path;
      if(!m[k]) m[k]={method:r.method,path:r.path,base:basePath(r.path),count:0,totalDur:0,errors:0,totalNet:0};
      m[k].count++; m[k].totalDur+=r.duration; m[k].totalNet+=r.networkUsage;
      if(r.statusCode>=400) m[k].errors++;
    }
    return Object.values(m).sort((a,b)=>b.count-a.count);
  }

  function filterEp(){
    showAll=false; recentPage=1;
    renderEp();
  }
  function clearSearch(){
    document.getElementById('searchInput').value='';
    document.getElementById('methodFilter').value='';
    showAll=false; renderEp();
  }
  function toggleMore(){ showAll=!showAll; renderEp(); }

  function renderEp(){
    const search=document.getElementById('searchInput').value.toLowerCase().trim();
    const method=document.getElementById('methodFilter').value;
    const filtered=allEp.filter(e=>(!search||e.path.toLowerCase().includes(search))&&(!method||e.method===method));
    const isFiltering=search||method;
    const visible=isFiltering||showAll?filtered:filtered.slice(0,EP_PAGE);

    document.getElementById('epCount').textContent=filtered.length+' endpoint'+(filtered.length!==1?'s':'');
    document.getElementById('noRes').style.display=filtered.length===0?'block':'none';

    const groups={};
    for(const e of visible){ if(!groups[e.base]) groups[e.base]=[]; groups[e.base].push(e); }

    let html='';
    for(const [base,eps] of Object.entries(groups)){
      const multi=allEp.filter(e=>e.base===base).length>1;
      if(multi) html+=\`<div class="ep-grp-hdr">&#128193; \${base}</div>\`;
      for(const e of eps){
        const avg=e.count?Math.round(e.totalDur/e.count):0;
        const errR=e.count?((e.errors/e.count)*100).toFixed(1)+'%':'0%';
        html+=\`<div class="ep-row">
          <span class="mth \${e.method}">\${e.method}</span>
          <span class="path-cell">\${e.path}</span>
          <span>\${e.count}</span>
          <span style="color:\${avg>500?'#f87171':avg>200?'#fbbf24':'#4ade80'}">\${avg}ms</span>
          <span style="color:\${e.errors>0?'#f87171':'#4ade80'}">\${errR}</span>
          <span>\${kb(e.totalNet)}</span>
        </div>\`;
      }
    }
    document.getElementById('epRows').innerHTML=html;

    const moreWrap=document.getElementById('moreWrap');
    if(!isFiltering&&filtered.length>EP_PAGE){
      moreWrap.style.display='block';
      document.getElementById('moreBtn').textContent=showAll
        ?'\\u25B2 Show less'
        :\`\\u25BC Show \${filtered.length-EP_PAGE} more endpoints\`;
    } else { moreWrap.style.display='none'; }
  }

  function filterByRange(reqs){
    if(rangeMs===Infinity) return reqs;
    const cutoff=Date.now()-rangeMs;
    return reqs.filter(r=>r.timestamp>=cutoff);
  }

  function computeStats(reqs, fallback){
    if(rangeMs===Infinity) return fallback;
    const total=reqs.length;
    if(!total) return {...fallback,totalRequests:0,averageResponseTime:0,p95ResponseTime:0,errorRate:0,averageNetworkUsage:0,totalNetworkUsage:0};
    const sorted=[...reqs].sort((a,b)=>a.duration-b.duration);
    const p95=sorted[Math.floor(sorted.length*0.95)]?.duration??0;
    const errors=reqs.filter(r=>r.statusCode>=400).length;
    const totalNet=reqs.reduce((s,r)=>s+r.networkUsage,0);
    return{
      totalRequests:total,
      averageResponseTime:reqs.reduce((s,r)=>s+r.duration,0)/total,
      p95ResponseTime:p95,
      errorRate:(errors/total)*100,
      averageNetworkUsage:totalNet/total,
      totalNetworkUsage:totalNet,
      statusDistribution:fallback.statusDistribution
    };
  }

  let _recentAll = [];
  function renderRecentTable(reqs){
    _recentAll = reqs;
    const visible = reqs.slice(0, recentPage * REQ_PAGE);
    const count = reqs.length;
    document.getElementById('recentCount').textContent = count + ' request' + (count !== 1 ? 's' : '') + ' in range';
    document.getElementById('recentBody').innerHTML = visible.map(r => \`
      <tr>
        <td>\${tstr(r.timestamp)}</td>
        <td><span class="mth \${r.method}">\${r.method}</span></td>
        <td class="path-cell">\${r.path}</td>
        <td><span class="badge \${bclass(r.statusCode)}">\${r.statusCode}</span></td>
        <td style="color:\${r.duration>500?'#f87171':r.duration>200?'#fbbf24':'#cbd5e1'}">\${fmt(r.duration)}</td>
        <td>\${kb(r.networkUsage)}</td>
      </tr>\`).join('') || '<tr><td colspan="6" style="text-align:center;color:#475569;padding:20px">No requests in this time range</td></tr>';
    const loadMoreWrap = document.getElementById('recentMoreWrap');
    if(visible.length < count){
      loadMoreWrap.style.display='block';
      document.getElementById('recentMoreBtn').textContent = \`\\u25BC Load more (\${count - visible.length} remaining)\`;
    } else {
      loadMoreWrap.style.display='none';
    }
  }
  function loadMoreRecent(){ recentPage++; renderRecentTable(_recentAll); }

  function render(data){
    const recent=filterByRange(data.recentRequests);
    const slowest=filterByRange(data.slowestRequests);
    const s=computeStats(recent,data.stats);
    const p95ms=Math.round(s.p95ResponseTime);

    document.getElementById('sTotal').textContent=s.totalRequests.toLocaleString();
    document.getElementById('sAvg').textContent=fmt(s.averageResponseTime);
    document.getElementById('sP95').textContent=p95ms+'ms';
    document.getElementById('sP95').style.color=p95Color(p95ms);
    document.getElementById('p95Hint').textContent=p95Label(p95ms);
    document.getElementById('sErr').textContent=s.errorRate.toFixed(1)+'%';
    document.getElementById('sErr').style.color=s.errorRate>5?'#f87171':'#4ade80';
    document.getElementById('sBw').textContent=mb(s.totalNetworkUsage);
    document.getElementById('sBwAvg').textContent='avg '+(s.averageNetworkUsage/1024).toFixed(1)+' KB/req';

    // Chart — show up to 60 most recent, chronological order
    const chartReqs=recent.slice(0,60).reverse();
    if(chart) chart.destroy();
    chart=new Chart(document.getElementById('latencyChart'),{
      type:'line',
      data:{
        labels:chartReqs.map(r=>tstr(r.timestamp)),
        datasets:[{
          label:'Latency (ms)',data:chartReqs.map(r=>r.duration),
          borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,.12)',
          tension:.3,fill:true,pointRadius:3,pointBackgroundColor:'#6366f1'
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw.toFixed(1)+'ms'}}},
        scales:{
          x:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'#1e293b'}},
          y:{ticks:{color:'#64748b',font:{size:10},callback:v=>v+'ms'},grid:{color:'#1e293b'}}
        }
      }
    });

    // Endpoints
    allEp=buildEp(recent);
    renderEp();

    // Recent table — paginated, show all
    recentPage=1;
    renderRecentTable(recent);

    // Slowest table
    document.getElementById('slowestBody').innerHTML=slowest.slice(0,10).map(r=>\`
      <tr>
        <td><span class="mth \${r.method}">\${r.method}</span></td>
        <td class="path-cell">\${r.path}</td>
        <td class="\${r.duration>500?'slow':''}">\${fmt(r.duration)}</td>
        <td><span class="badge \${bclass(r.statusCode)}">\${r.statusCode}</span></td>
      </tr>\`).join('')||'<tr><td colspan="4" style="text-align:center;color:#475569;padding:20px">No data in this time range</td></tr>';

    document.getElementById('loading').style.display='none';
    document.getElementById('mainContent').style.display='block';
  }

  async function loadData(){
    try{
      const res=await fetch(DATA_URL);
      if(!res.ok) throw new Error('Server responded '+res.status);
      allData=await res.json();

      // Last accessed
      const prev=localStorage.getItem('rt_last');
      const now=new Date().toLocaleString();
      if(prev) document.getElementById('lastAccessed').textContent='\\uD83D\\uDD53 Last accessed: '+prev;
      localStorage.setItem('rt_last',now);

      render(allData);
      document.getElementById('alertBox').style.display='none';
    }catch(e){
      document.getElementById('loading').style.display='none';
      const a=document.getElementById('alertBox');
      a.className='alert-err';
      a.innerHTML='<strong>Error:</strong> '+e.message+'<br><small>Make sure your server is running on \${origin}</small>';
      a.style.display='block';
    }
  }

  loadData();
  setInterval(loadData,10000);
<\/script>
</body>
</html>`;
}

export default createRequestTracker;
