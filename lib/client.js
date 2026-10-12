/**
 * dsh-token-usage-panel · 浏览器侧
 * =================================
 * 在「设置」里注册一个 Token 用量分区。设计上刻意贴合 DSH 自己的设置界面：
 *   · 只用 DSH 的语义色变量（--dsw-alias-*），浅色 / 深色主题都正常
 *   · 分区之间用分隔线而不是一排小盒子；只有「今日」用一块强调底色
 *   · 面板很窄：格子尺寸、表格列数、分组布局都跟着实际宽度自适应
 *
 * 数据来自 Host 侧注册的 GET /token-usage/data。
 */

window.__ModuleLoader__.load({
  id: 'dsh-token-usage-panel',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;

    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const BUCKET_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'];
    const DATA_URL = '/token-usage/data';
    const PRICE_KEYS = ['pIn', 'pOut', 'pCache', 'pWrite'];
    const NS = 'settings.tokenUsage';
    const WEEKS = 53;

    // ------------------------------------------------------------------
    // 文案
    // ------------------------------------------------------------------
    const zh = {
      nav: 'Token 用量',
      title: 'Token 用量',
      subtitle: '按本机时区的自然日统计，数据来自本机会话日志。',
      refresh: '刷新',
      auto: '自动刷新',
      today: '今日消耗',
      last7: '近 7 天',
      last30: '近 30 天',
      total: '累计',
      activeDays: '活跃天数',
      streak: '连续使用',
      hitRate: '缓存命中率',
      costTotal: '估算花费',
      tokens: 'tokens',
      sessionsUnit: '个会话',
      daysUnit: '天',
      output: '输出',
      input: '未缓存输入',
      cache: '缓存命中',
      cacheWrite: '缓存写入',
      shortInput: '输入',
      shortCache: '命中',
      sum: '合计',
      estimate: '估算金额',
      heatTitle: '每日消耗',
      heatHint: '最近 53 周 · 点格子看当天明细',
      less: '少',
      more: '多',
      trendTitle: '最近 30 天',
      trendHint: '堆叠：输出 / 未缓存输入 / 缓存命中',
      dayTitle: '当天明细',
      noData: '没有消耗记录',
      noSessions: '没有匹配的会话',
      sessionTitle: '会话明细',
      sessionHint: '点表头排序',
      searchPlaceholder: '搜索标题 / 工作区 / 会话 ID',
      colSession: '会话',
      colSteps: '步数',
      colLast: '最后活动',
      modelTitle: '按模型',
      workspaceTitle: '按工作区',
      colModel: '模型',
      costTitle: '成本估算',
      costHint: '填单价（元 / 百万 token）自动换算，只存在本机浏览器',
      costOn: '已启用',
      costOff: '未启用',
      clear: '清空',
      updatedAt: '更新于',
      scanInfo: '扫描 {files} 个日志 / {ms}ms',
      loading: '正在读取用量数据…',
      failed: '读取失败',
      failedHint: 'Host 侧接口 /token-usage/data 不可用。若在桌面客户端（file://）里使用，请用浏览器打开 dsh web 的地址。',
      childAgent: '子代理',
      ofDay: '占当天',
      priceIn: '未缓存输入',
      priceOut: '输出',
      priceCache: '缓存命中',
      priceWrite: '缓存写入',
      activeHits: '{n} 天有消耗',
    };
    const en = {
      nav: 'Token usage',
      title: 'Token usage',
      subtitle: 'Bucketed by local calendar day, read from this machine’s session logs.',
      refresh: 'Refresh',
      auto: 'Auto',
      today: 'Used today',
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      total: 'All time',
      activeDays: 'Active days',
      streak: 'Streak',
      hitRate: 'Cache hit rate',
      costTotal: 'Est. cost',
      tokens: 'tokens',
      sessionsUnit: 'sessions',
      daysUnit: 'days',
      output: 'Output',
      input: 'Uncached input',
      cache: 'Cache read',
      cacheWrite: 'Cache write',
      shortInput: 'Input',
      shortCache: 'Cache',
      sum: 'Total',
      estimate: 'Est. cost',
      heatTitle: 'Daily usage',
      heatHint: 'last 53 weeks · click a cell for details',
      less: 'Less',
      more: 'More',
      trendTitle: 'Last 30 days',
      trendHint: 'stacked: output / uncached input / cache read',
      dayTitle: 'Day detail',
      noData: 'No usage this day',
      noSessions: 'No matching session',
      sessionTitle: 'Sessions',
      sessionHint: 'click a header to sort',
      searchPlaceholder: 'Search title / workspace / id',
      colSession: 'Session',
      colSteps: 'Steps',
      colLast: 'Last activity',
      modelTitle: 'By model',
      workspaceTitle: 'By workspace',
      colModel: 'Model',
      costTitle: 'Cost estimate',
      costHint: 'prices per million tokens, kept in this browser only',
      costOn: 'on',
      costOff: 'off',
      clear: 'Clear',
      updatedAt: 'Updated',
      scanInfo: 'scanned {files} logs in {ms}ms',
      loading: 'Reading usage data…',
      failed: 'Request failed',
      failedHint: 'The host route /token-usage/data is unavailable. In the desktop client (file://) open the dsh web URL in a browser.',
      childAgent: 'subagent',
      ofDay: 'of day',
      priceIn: 'Uncached input',
      priceOut: 'Output',
      priceCache: 'Cache read',
      priceWrite: 'Cache write',
      activeHits: '{n} active days',
    };

    // ------------------------------------------------------------------
    // 样式：全部走 DSH 的语义变量
    // ------------------------------------------------------------------
    const CSS = `
.dshtu{
  --dshtu-line:var(--dsw-alias-border-l2,#0000001a);
  --dshtu-line-strong:var(--dsw-alias-border-l3,#0000001f);
  --dshtu-fg:var(--dsw-alias-label-primary,#0f1115);
  --dshtu-fg2:var(--dsw-alias-label-secondary,#61666b);
  --dshtu-accent:var(--dsw-alias-state-business-primary,#4176e6);
  --dshtu-hover:var(--dsw-alias-interactive-bg-hover,#2631480f);
  color:var(--dshtu-fg);font-size:13px;line-height:1.5;padding-bottom:22px;
}
.dshtu *{box-sizing:border-box}
.dshtu .num{font-variant-numeric:tabular-nums}
.dshtu .mut{color:var(--dshtu-fg2)}
.dshtu .sec{padding:16px 0;border-top:1px solid var(--dshtu-line)}
.dshtu .hd{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.dshtu .hd h3{margin:0;font-size:13px;font-weight:600}
.dshtu .hd .hint{margin-left:auto;font-size:11.5px;color:var(--dshtu-fg2);white-space:nowrap}
.dshtu button{font:inherit;font-size:12px;color:var(--dshtu-fg);background:transparent;border:1px solid var(--dshtu-line-strong);border-radius:8px;padding:4px 10px;cursor:pointer}
.dshtu button:hover{border-color:var(--dshtu-accent);color:var(--dshtu-accent)}
.dshtu input[type=text],.dshtu input[type=number]{font:inherit;font-size:12px;color:var(--dshtu-fg);background:transparent;border:1px solid var(--dshtu-line-strong);border-radius:8px;padding:4px 9px}
.dshtu input[type=number]{width:100%;min-width:0}
.dshtu input:focus{outline:none;border-color:var(--dshtu-accent)}
.dshtu .top{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.dshtu .top .who{flex:1 1 200px;min-width:0}
.dshtu .top h3{margin:0;font-size:14px;font-weight:600}
.dshtu .top .sub{margin-top:3px;font-size:12px;color:var(--dshtu-fg2)}
.dshtu .top .acts{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dshtu-fg2)}
.dshtu .top .acts label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none}
.dshtu .stamp{margin-top:9px;font-size:11.5px;color:var(--dshtu-fg2)}

.dshtu .hero{margin-top:13px;border-radius:12px;padding:13px 16px;background:color-mix(in srgb,var(--dshtu-accent) 7%,transparent);display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.dshtu .hero .k{font-size:12px;color:var(--dshtu-fg2)}
.dshtu .hero .v{font-size:30px;font-weight:650;letter-spacing:-.5px;line-height:1.15;margin-top:1px}
.dshtu .hero .v i{font-style:normal;font-size:13px;font-weight:500;color:var(--dshtu-fg2);margin-left:6px}
.dshtu .hero .bd{margin-left:auto;display:flex;flex-direction:column;gap:3px;font-size:12px;min-width:168px}
.dshtu .hero .bd>div{display:flex;align-items:center;gap:7px;justify-content:space-between}
.dshtu .hero .bd .l{color:var(--dshtu-fg2);display:inline-flex;align-items:center;gap:6px}
.dshtu .dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:0 0 auto}

.dshtu .metrics{margin-top:13px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--dshtu-line);border-radius:12px;overflow:hidden}
.dshtu .metrics .cell{padding:10px 13px;border-right:1px solid var(--dshtu-line);border-bottom:1px solid var(--dshtu-line);min-width:0}
.dshtu .metrics .cell:nth-child(3n){border-right:0}
.dshtu .metrics .cell:nth-child(n+4){border-bottom:0}
.dshtu .metrics .k{font-size:11.5px;color:var(--dshtu-fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshtu .metrics .v{font-size:19px;font-weight:600;letter-spacing:-.2px;margin-top:2px}
.dshtu .metrics .v i{font-style:normal;font-size:11.5px;font-weight:500;color:var(--dshtu-fg2);margin-left:4px}
.dshtu .metrics .s{margin-top:1px;font-size:11px;color:var(--dshtu-fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.dshtu .hm{display:flex;gap:6px}
.dshtu .hm .wd{display:flex;flex-direction:column;justify-content:space-between;font-size:9.5px;color:var(--dshtu-fg2);line-height:1;flex:0 0 auto}
.dshtu .hm .wd span{display:flex;align-items:center;height:1em}
.dshtu .hm .cols{display:flex;flex-direction:column;gap:4px;min-width:0}
.dshtu .hm .mo{display:flex;font-size:10px;color:var(--dshtu-fg2);height:12px}
.dshtu .hm .mo i{font-style:normal;white-space:nowrap;overflow:visible;flex:0 0 auto}
.dshtu .hm .grid{display:flex;gap:2px}
.dshtu .hm .wk{display:flex;flex-direction:column;gap:2px}
.dshtu .cell{border-radius:2px;background:var(--dshtu-line);cursor:pointer}
.dshtu .cell:hover{box-shadow:inset 0 0 0 1.5px var(--dshtu-fg)}
.dshtu .cell.sel{box-shadow:inset 0 0 0 1.5px var(--dshtu-accent)}
.dshtu .cell.future{opacity:.4;cursor:default}
.dshtu .lv1{background:color-mix(in srgb,var(--dshtu-accent) 22%,transparent)}
.dshtu .lv2{background:color-mix(in srgb,var(--dshtu-accent) 42%,transparent)}
.dshtu .lv3{background:color-mix(in srgb,var(--dshtu-accent) 66%,transparent)}
.dshtu .lv4{background:color-mix(in srgb,var(--dshtu-accent) 100%,transparent)}
.dshtu .lg{display:flex;align-items:center;gap:4px;justify-content:flex-end;margin-top:8px;font-size:11px;color:var(--dshtu-fg2)}
.dshtu .lg b{width:10px;height:10px;border-radius:2px;background:var(--dshtu-line);display:inline-block}
.dshtu .lg .sp{flex:1;text-align:left}

.dshtu .chart{position:relative;height:104px;border-bottom:1px solid var(--dshtu-line)}
.dshtu .chart .gl{position:absolute;left:0;right:0;border-top:1px dashed var(--dshtu-line)}
.dshtu .chart .gl.top{border-top-style:solid}
.dshtu .chart .gl em{position:absolute;left:0;top:-9px;font-style:normal;font-size:10px;color:var(--dshtu-fg2);padding-right:6px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dshtu .bars{position:absolute;inset:0;display:flex;align-items:flex-end;gap:2px}
.dshtu .bar{flex:1 1 0;min-width:3px;height:100%;display:flex;flex-direction:column;justify-content:flex-end}
.dshtu .bar:hover .seg{filter:brightness(1.15)}
.dshtu .seg{width:100%;min-height:1px}
.dshtu .barx{display:flex;gap:2px;margin-top:5px;font-size:10px;color:var(--dshtu-fg2)}
.dshtu .barx div{flex:1 1 0;min-width:3px;text-align:center;white-space:nowrap;overflow:visible}

.dshtu .tbar{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.dshtu .tbar input[type=text]{flex:1 1 150px;max-width:260px}
.dshtu .cnt{font-size:11.5px;color:var(--dshtu-fg2)}
.dshtu .scroll{overflow:auto;max-height:320px;border-radius:8px}
.dshtu table{width:100%;border-collapse:collapse;font-size:12.5px}
.dshtu th,.dshtu td{padding:7px 8px;text-align:right;border-bottom:1px solid var(--dshtu-line);white-space:nowrap;vertical-align:middle}
.dshtu th:first-child,.dshtu td:first-child{text-align:left}
.dshtu th{font-size:11.5px;font-weight:500;color:var(--dshtu-fg2);cursor:pointer;user-select:none;position:sticky;top:0;background:var(--dsw-alias-bg-layer-1,#fff);z-index:1}
.dshtu th.nosort{cursor:default}
.dshtu th:hover{color:var(--dshtu-fg)}
.dshtu tbody tr:hover td{background:var(--dshtu-hover)}
.dshtu tbody tr:last-child td{border-bottom:0}
.dshtu .ttl{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshtu .cellwrap{min-width:0}
.dshtu .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:var(--dshtu-fg2)}
.dshtu .sub2{font-size:11px;color:var(--dshtu-fg2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshtu .mini{display:flex;gap:2px;justify-content:flex-end}
.dshtu .mini i{width:5px;height:13px;border-radius:1.5px;background:var(--dshtu-line);display:block}
.dshtu .pill{border:1px solid var(--dshtu-line);border-radius:999px;padding:0 6px;font-size:10.5px;color:var(--dshtu-fg2);margin-left:6px}
.dshtu .barcell{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.dshtu .track{width:54px;height:3px;border-radius:2px;background:var(--dshtu-line);overflow:hidden}
.dshtu .track i{display:block;height:100%;background:var(--dshtu-accent);border-radius:2px}
.dshtu .groups{display:flex;flex-direction:column;gap:16px}
.dshtu .empty{padding:14px 0;text-align:center;font-size:12.5px;color:var(--dshtu-fg2)}

.dshtu .prices{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.dshtu .prices label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--dshtu-fg2);min-width:0}
.dshtu .costfoot{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:11.5px;color:var(--dshtu-fg2)}
@media (max-width:520px){.dshtu .prices{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-token-usage-panel"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-token-usage-panel';
      tag.dataset.pluginCss = 'dsh-token-usage-panel';
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------------
    // 工具
    // ------------------------------------------------------------------
    function num(value) {
      return Number(value || 0).toLocaleString('en-US');
    }
    function short(value) {
      let n = Number(value || 0);
      if (!n) return '0';
      const units = ['', 'K', 'M', 'B', 'T'];
      let i = 0;
      while (Math.abs(n) >= 1000 && i < units.length - 1) {
        n /= 1000;
        i += 1;
      }
      return (i === 0 ? n.toFixed(0) : n < 10 ? n.toFixed(2) : n.toFixed(1)) + units[i];
    }
    function bk(bucket, key) {
      return Number((bucket && bucket[key]) || 0);
    }
    function emptyBucket() {
      const o = {};
      BUCKET_KEYS.forEach((k) => {
        o[k] = 0;
      });
      return o;
    }
    function sumBucket(a, b) {
      const o = emptyBucket();
      BUCKET_KEYS.forEach((k) => {
        o[k] = bk(a, k) + bk(b, k);
      });
      return o;
    }
    function dayKey(date) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    function addDays(date, n) {
      const copy = new Date(date.getTime());
      copy.setDate(copy.getDate() + n);
      return copy;
    }
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    function readPrices() {
      const out = {};
      PRICE_KEYS.forEach((key) => {
        let raw = null;
        try {
          raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`dsh.tokenUsage.${key}`) : null;
        } catch {
          raw = null;
        }
        out[key] = raw ? Number(raw) || 0 : 0;
      });
      return out;
    }
    function priceEnabled(p) {
      return Boolean(p.pIn || p.pOut || p.pCache || p.pWrite);
    }
    function costOf(bucket, p) {
      if (!priceEnabled(p)) return null;
      return (
        (bk(bucket, 'inputTokens') * (p.pIn || 0) +
          bk(bucket, 'outputTokens') * (p.pOut || 0) +
          bk(bucket, 'cacheReadTokens') * (p.pCache || 0) +
          bk(bucket, 'cacheWriteTokens') * (p.pWrite || 0)) /
        1e6
      );
    }
    function money(v) {
      if (v === null) return '—';
      return `¥${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
    }

    /** 设置面板宽度会随窗口变化，布局按实际宽度自适应。 */
    function useWidth(ref) {
      const [width, setWidth] = useState(0);
      useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;
        const read = () => setWidth(node.clientWidth || 0);
        read();
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', read);
          return () => window.removeEventListener('resize', read);
        }
        const observer = new ResizeObserver(read);
        observer.observe(node);
        return () => observer.disconnect();
      }, [ref]);
      return width;
    }

    /** 颜色条 / 图例用的语义色 */
    const COLOR = {
      output: 'var(--dsw-alias-state-business-primary,#4176e6)',
      input: 'var(--dsw-alias-state-warn-label,#dd8629)',
      cache: 'var(--dsw-alias-state-success-primary,#22c55e)',
    };

    // ------------------------------------------------------------------
    // 主体
    // ------------------------------------------------------------------
    function TokenUsageSection(props) {
      const t = props.t || ((key) => zh[key] || en[key] || key);
      const rootRef = useRef(null);
      const width = useWidth(rootRef);
      const narrow = width > 0 && width < 560;

      const [state, setState] = useState({ status: 'loading', data: null, error: null });
      const [prices, setPrices] = useState(readPrices);
      const [sort, setSort] = useState({ key: 'total', dir: -1 });
      const [filter, setFilter] = useState('');
      const [selectedDay, setSelectedDay] = useState(null);
      const [tip, setTip] = useState(null);
      const [auto, setAuto] = useState(true);
      const timer = useRef(null);

      const load = useCallback((force) => {
        setState((prev) => (prev.data ? { ...prev, error: null } : { status: 'loading', data: null, error: null }));
        fetch(DATA_URL + (force ? '?refresh=1' : ''), { cache: 'no-store' })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((data) => {
            if (data && data.error) throw new Error(data.error);
            setState({ status: 'ready', data, error: null });
          })
          .catch((error) => setState({ status: 'error', data: null, error: String((error && error.message) || error) }));
      }, []);

      useEffect(() => {
        load(false);
      }, [load]);

      useEffect(() => {
        if (timer.current) clearInterval(timer.current);
        if (auto) timer.current = setInterval(() => load(true), 30000);
        return () => {
          if (timer.current) clearInterval(timer.current);
        };
      }, [auto, load]);

      function savePrice(key, value) {
        setPrices((prev) => ({ ...prev, [key]: value }));
        try {
          if (value) localStorage.setItem(`dsh.tokenUsage.${key}`, String(value));
          else localStorage.removeItem(`dsh.tokenUsage.${key}`);
        } catch {
          /* 忽略写入失败 */
        }
      }

      const data = state.data;

      const derived = useMemo(() => {
        if (!data) return null;
        const days = data.days || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayK = dayKey(today);
        let last7 = emptyBucket();
        let last30 = emptyBucket();
        for (let i = 0; i < 30; i += 1) {
          const bucket = days[dayKey(addDays(today, -i))];
          if (!bucket) continue;
          last30 = sumBucket(last30, bucket);
          if (i < 7) last7 = sumBucket(last7, bucket);
        }
        const totals = data.totals || emptyBucket();
        const denom = bk(totals, 'cacheReadTokens') + bk(totals, 'inputTokens');
        return {
          days,
          today,
          todayK,
          todayBucket: days[todayK] || emptyBucket(),
          last7,
          last30,
          totals,
          hitRate: denom ? (bk(totals, 'cacheReadTokens') / denom) * 100 : 0,
          activeDays: Object.keys(days).length,
          todaySessions: (data.daySessions && data.daySessions[todayK]) || [],
          maxDay: Object.keys(days).reduce((max, key) => Math.max(max, bk(days[key], 'totalTokens')), 0),
        };
      }, [data]);

      const rows = useMemo(() => {
        if (!data) return [];
        const query = filter.trim().toLowerCase();
        const list = (data.sessions || []).filter((s) => {
          if (!query) return true;
          return `${s.title} ${s.workspace} ${s.id} ${s.cwd || ''}`.toLowerCase().includes(query);
        });
        const value = (s) => {
          if (sort.key === 'total') return bk(s.totals, 'totalTokens');
          if (sort.key === 'output') return bk(s.totals, 'outputTokens');
          if (sort.key === 'cache') return bk(s.totals, 'cacheReadTokens');
          if (sort.key === 'steps') return s.steps || 0;
          return s[sort.key] || 0;
        };
        return [...list]
          .sort((a, b) => {
            const va = value(a);
            const vb = value(b);
            if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * sort.dir;
            return (va - vb) * sort.dir;
          })
          .slice(0, 200);
      }, [data, filter, sort]);

      if (!data) {
        return h(
          'div',
          { className: 'dshtu', ref: rootRef },
          h('div', { className: 'top' }, h('div', { className: 'who' }, h('h3', null, t('title')), h('div', { className: 'sub' }, t('subtitle')))),
          state.status === 'error'
            ? h(
                'div',
                { className: 'sec' },
                h('div', { className: 'hd' }, h('h3', null, t('failed'))),
                h('div', { className: 'mut' }, state.error || ''),
                h('div', { className: 'mut', style: { marginTop: 6 } }, t('failedHint'))
              )
            : h('div', { className: 'empty' }, t('loading'))
        );
      }

      // ---------------- 悬浮提示 ----------------
      function bucketTip(bucket, title, extra) {
        const tipRows = ['outputTokens', 'inputTokens', 'cacheReadTokens', 'cacheWriteTokens']
          .filter((k) => bk(bucket, k) > 0)
          .map((k) =>
            h(
              'tr',
              { key: k },
              h('td', null, t(k === 'outputTokens' ? 'output' : k === 'inputTokens' ? 'input' : k === 'cacheReadTokens' ? 'cache' : 'cacheWrite')),
              h('td', null, num(bk(bucket, k)))
            )
          );
        tipRows.push(h('tr', { key: 'sum' }, h('td', null, h('b', null, t('sum'))), h('td', null, h('b', null, num(bk(bucket, 'totalTokens'))))));
        const money2 = costOf(bucket, prices);
        if (money2 !== null) tipRows.push(h('tr', { key: 'cost' }, h('td', null, t('estimate')), h('td', null, money(money2))));
        return h(
          'div',
          null,
          h('b', null, title),
          h('table', null, h('tbody', null, tipRows)),
          extra ? h('div', { className: 'mut', style: { marginTop: 3, fontSize: 11 } }, extra) : null
        );
      }
      const tipEl = tip
        ? h(
            'div',
            {
              className: 'dshtu-tip',
              style: {
                left: clamp(tip.x + 14, 8, Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300)),
                top: tip.y + 14,
              },
            },
            tip.node
          )
        : null;

      // ---------------- 顶部 + 今日 ----------------
      const heroCost = costOf(derived.todayBucket, prices);
      const head = h(
        'div',
        null,
        h(
          'div',
          { className: 'top' },
          h('div', { className: 'who' }, h('h3', null, t('title')), h('div', { className: 'sub' }, t('subtitle'))),
          h(
            'div',
            { className: 'acts' },
            h('label', null, h('input', { type: 'checkbox', checked: auto, onChange: (e) => setAuto(e.target.checked) }), t('auto')),
            h('button', { type: 'button', onClick: () => load(true) }, t('refresh'))
          )
        ),
        h(
          'div',
          { className: 'stamp' },
          `${t('updatedAt')} ${data.generatedAtText || ''} · ` +
            t('scanInfo').replace('{files}', String((data.cache && data.cache.files) || 0)).replace('{ms}', String(data.scanMs || 0))
        ),
        h(
          'div',
          { className: 'hero' },
          h(
            'div',
            null,
            h('div', { className: 'k' }, t('today')),
            h('div', { className: 'v num' }, short(bk(derived.todayBucket, 'totalTokens')), h('i', null, t('tokens'))),
            heroCost !== null ? h('div', { className: 'k', style: { marginTop: 1 } }, `${t('estimate')} ${money(heroCost)}`) : null
          ),
          h(
            'div',
            { className: 'bd' },
            [
              [t('output'), bk(derived.todayBucket, 'outputTokens'), COLOR.output],
              [t('input'), bk(derived.todayBucket, 'inputTokens'), COLOR.input],
              [t('cache'), bk(derived.todayBucket, 'cacheReadTokens'), COLOR.cache],
            ].map(([label, value, color]) =>
              h('div', { key: label }, h('span', { className: 'l' }, h('i', { className: 'dot', style: { background: color } }), label), h('span', { className: 'num' }, short(value)))
            )
          )
        )
      );

      // ---------------- 指标 ----------------
      const metricCells = [
        { k: t('last7'), v: short(bk(derived.last7, 'totalTokens')), u: t('tokens'), s: `${t('output')} ${short(bk(derived.last7, 'outputTokens'))}` },
        { k: t('last30'), v: short(bk(derived.last30, 'totalTokens')), u: t('tokens'), s: `${t('output')} ${short(bk(derived.last30, 'outputTokens'))}` },
        { k: t('total'), v: short(bk(derived.totals, 'totalTokens')), u: t('tokens'), s: `${t('input')} ${short(bk(derived.totals, 'inputTokens'))}` },
        { k: t('activeDays'), v: String(derived.activeDays), u: t('daysUnit'), s: t('activeHits').replace('{n}', String(derived.activeDays)) },
        { k: t('streak'), v: String(data.streak || 0), u: t('daysUnit'), s: `${(data.sessions || []).length} ${t('sessionsUnit')}` },
        {
          k: t('hitRate'),
          v: derived.hitRate.toFixed(1),
          u: '%',
          s: `${short(bk(derived.totals, 'cacheReadTokens'))} / ${short(bk(derived.totals, 'cacheReadTokens') + bk(derived.totals, 'inputTokens'))}`,
        },
      ];
      const totalCost = costOf(derived.totals, prices);
      if (totalCost !== null) metricCells[5].s = `${t('costTotal')} ${money(totalCost)}`;
      const metrics = h(
        'div',
        { className: 'metrics' },
        metricCells.map((cell) =>
          h(
            'div',
            { className: 'cell', key: cell.k },
            h('div', { className: 'k' }, cell.k),
            h('div', { className: 'v num' }, cell.v, cell.u ? h('i', null, cell.u) : null),
            h('div', { className: 's' }, cell.s)
          )
        )
      );

      // ---------------- 热力图 ----------------
      const today = derived.today;
      const gap = 2;
      const available = width > 0 ? width : 620;
      const cell = clamp(Math.floor((available - 26 - gap * (WEEKS - 1)) / WEEKS), 6, 11);
      let start = addDays(today, -364);
      start = addDays(start, -start.getDay());
      const end = addDays(today, 6 - today.getDay());
      const weeks = [];
      const monthLabels = [];
      let lastMonth = -1;
      let cursor = new Date(start.getTime());
      while (cursor <= end) {
        const week = [];
        for (let d = 0; d < 7; d += 1) {
          const key = dayKey(cursor);
          const bucket = derived.days[key];
          const value = bucket ? bk(bucket, 'totalTokens') : 0;
          const future = cursor > today;
          let level = 0;
          if (value) {
            const ratio = derived.maxDay ? value / derived.maxDay : 1;
            level = ratio <= 0.15 ? 1 : ratio <= 0.35 ? 2 : ratio <= 0.65 ? 3 : 4;
          }
          week.push({ key, value, future, level, bucket: bucket || emptyBucket() });
          cursor = addDays(cursor, 1);
        }
        weeks.push(week);
        const month = Number(week[0].key.slice(5, 7));
        if (month !== lastMonth) {
          monthLabels.push(`${month}月`);
          lastMonth = month;
        } else {
          monthLabels.push('');
        }
      }
      const cellStyle = { width: cell, height: cell };
      const heatmap = h(
        'div',
        { className: 'sec' },
        h('div', { className: 'hd' }, h('h3', null, t('heatTitle')), h('span', { className: 'hint' }, t('heatHint'))),
        h(
          'div',
          { className: 'hm' },
          h('div', { className: 'wd', style: { height: cell * 7 + gap * 6 } }, ['', '一', '', '三', '', '五', ''].map((d, i) => h('span', { key: i }, d))),
          h(
            'div',
            { className: 'cols' },
            h(
              'div',
              { className: 'mo' },
              monthLabels.map((label, i) => h('i', { key: i, style: { width: cell + gap } }, label))
            ),
            h(
              'div',
              { className: 'grid' },
              weeks.map((week, wi) =>
                h(
                  'div',
                  { className: 'wk', key: wi },
                  week.map((c) =>
                    h('div', {
                      key: c.key,
                      className: `cell${c.future ? ' future' : ''}${c.value ? ` lv${c.level}` : ''}${selectedDay === c.key ? ' sel' : ''}`,
                      style: cellStyle,
                      onMouseEnter: c.future
                        ? undefined
                        : (event) =>
                            setTip({
                              x: event.clientX,
                              y: event.clientY,
                              node: bucketTip(c.bucket, c.key, c.value ? `${num(c.value)} tokens` : t('noData')),
                            }),
                      onMouseLeave: c.future ? undefined : () => setTip(null),
                      onClick: c.future ? undefined : () => setSelectedDay(selectedDay === c.key ? null : c.key),
                    })
                  )
                )
              )
            )
          )
        ),
        h(
          'div',
          { className: 'lg' },
          h('span', { className: 'sp' }, t('activeHits').replace('{n}', String(derived.activeDays))),
          t('less'),
          ['', 'lv1', 'lv2', 'lv3', 'lv4'].map((cls, i) => h('b', { key: i, className: cls })),
          t('more')
        )
      );

      // ---------------- 当天明细 ----------------
      let dayPanel = null;
      if (selectedDay) {
        const bucket = derived.days[selectedDay] || emptyBucket();
        const ids = (data.daySessions && data.daySessions[selectedDay]) || [];
        const list = ids
          .map((id) => (data.sessions || []).find((s) => s.id === id))
          .filter(Boolean)
          .map((s) => ({ s, b: (s.days && s.days[selectedDay]) || emptyBucket() }))
          .sort((a, b) => bk(b.b, 'totalTokens') - bk(a.b, 'totalTokens'));
        dayPanel = h(
          'div',
          { className: 'sec' },
          h(
            'div',
            { className: 'hd' },
            h('h3', null, t('dayTitle')),
            h('span', { className: 'mut', style: { fontSize: 12 } }, `${selectedDay} · ${num(bk(bucket, 'totalTokens'))} tokens`),
            h('button', { type: 'button', onClick: () => setSelectedDay(null), style: { marginLeft: 'auto' } }, '×')
          ),
          list.length === 0
            ? h('div', { className: 'empty' }, t('noData'))
            : h(
                'div',
                { className: 'scroll' },
                h(
                  'table',
                  null,
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', { className: 'nosort' }, t('colSession')),
                      narrow ? null : h('th', { className: 'nosort' }, t('workspaceTitle')),
                      h('th', { className: 'nosort' }, t('sum')),
                      h('th', { className: 'nosort' }, t('output')),
                      h('th', { className: 'nosort' }, t('ofDay'))
                    )
                  ),
                  h(
                    'tbody',
                    null,
                    list.map((row) =>
                      h(
                        'tr',
                        { key: row.s.id },
                        h('td', { className: 'cellwrap' }, h('span', { className: 'ttl', title: row.s.title }, row.s.title)),
                        narrow ? null : h('td', { className: 'cellwrap', style: { maxWidth: 120 } }, h('span', { className: 'ttl' }, row.s.workspace || '—')),
                        h('td', { className: 'num' }, num(bk(row.b, 'totalTokens'))),
                        h('td', { className: 'num' }, num(bk(row.b, 'outputTokens'))),
                        h('td', { className: 'num' }, `${bk(bucket, 'totalTokens') ? ((bk(row.b, 'totalTokens') / bk(bucket, 'totalTokens')) * 100).toFixed(1) : '0.0'}%`)
                      )
                    )
                  )
                )
              )
        );
      }

      // ---------------- 30 天趋势 ----------------
      const barDays = [];
      for (let i = 29; i >= 0; i -= 1) {
        const key = dayKey(addDays(today, -i));
        barDays.push({ key, bucket: derived.days[key] || emptyBucket() });
      }
      const maxBar = Math.max(1, ...barDays.map((d) => bk(d.bucket, 'totalTokens')));
      const chart = h(
        'div',
        { className: 'sec' },
        h('div', { className: 'hd' }, h('h3', null, t('trendTitle')), h('span', { className: 'hint' }, t('trendHint'))),
        h(
          'div',
          { className: 'chart' },
          h('div', { className: 'gl top', style: { top: 0 } }, h('em', null, short(maxBar))),
          [0.25, 0.5, 0.75].map((f) => h('div', { className: 'gl', key: f, style: { bottom: `${f * 100}%` } })),
          h(
            'div',
            { className: 'bars' },
            barDays.map((day) =>
              h(
                'div',
                {
                  key: day.key,
                  className: 'bar',
                  onMouseEnter: (event) => setTip({ x: event.clientX, y: event.clientY, node: bucketTip(day.bucket, day.key, null) }),
                  onMouseLeave: () => setTip(null),
                },
                ['cacheReadTokens', 'inputTokens', 'outputTokens']
                  .map((key) => ({ key, value: bk(day.bucket, key) }))
                  .filter((s) => s.value > 0)
                  .map((s) =>
                    h('div', {
                      key: s.key,
                      className: 'seg',
                      style: { height: `${Math.max(1.5, (s.value / maxBar) * 100)}%`, background: s.key === 'outputTokens' ? COLOR.output : s.key === 'inputTokens' ? COLOR.input : COLOR.cache },
                    })
                  )
              )
            )
          )
        ),
        h(
          'div',
          { className: 'barx' },
          barDays.map((day, i) => h('div', { key: day.key }, i % 5 === 0 ? day.key.slice(5) : ''))
        )
      );

      // ---------------- 会话表 ----------------
      const maxTotal = Math.max(1, ...rows.map((s) => bk(s.totals, 'totalTokens')));
      const miniDays = narrow ? 14 : 30;
      function header(label, key) {
        return h(
          'th',
          {
            key,
            onClick: key ? () => setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 })) : undefined,
          },
          label + (key && sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : '')
        );
      }
      const sessionHeads = [
        header(t('colSession'), 'title'),
        narrow ? null : header(t('workspaceTitle'), 'workspace'),
        header(t('colSteps'), 'steps'),
        header(t('output'), 'output'),
        narrow ? null : header(t('shortCache'), 'cache'),
        header(t('sum'), 'total'),
        h('th', { className: 'nosort', key: 'mini' }, narrow ? t('colLast') : ''),
      ].filter(Boolean);

      const sessions = h(
        'div',
        { className: 'sec' },
        h('div', { className: 'hd' }, h('h3', null, t('sessionTitle')), h('span', { className: 'hint' }, t('sessionHint'))),
        h(
          'div',
          { className: 'tbar' },
          h('input', { type: 'text', placeholder: t('searchPlaceholder'), value: filter, onChange: (e) => setFilter(e.target.value) }),
          h('span', { className: 'cnt' }, `${rows.length} / ${(data.sessions || []).length}`)
        ),
        h(
          'div',
          { className: 'scroll' },
          h(
            'table',
            null,
            h('thead', null, h('tr', null, sessionHeads)),
            h(
              'tbody',
              null,
              rows.length === 0
                ? h('tr', null, h('td', { colSpan: sessionHeads.length, className: 'empty' }, t('noSessions')))
                : rows.map((s) =>
                    h(
                      'tr',
                      { key: s.id },
                      h(
                        'td',
                        { className: 'cellwrap', style: narrow ? undefined : { maxWidth: 230 } },
                        h('span', { className: 'ttl', title: `${s.title}\n${s.id}\n${s.cwd || ''}` }, s.title),
                        h('div', { className: 'sub2' }, narrow ? `${s.workspace || '—'} · ${(s.lastTimeText || '').slice(5, 16)}` : s.id),
                        s.delegationDepth ? h('span', { className: 'pill' }, t('childAgent')) : null
                      ),
                      narrow ? null : h('td', { className: 'cellwrap', style: { maxWidth: 130 } }, h('span', { className: 'ttl', title: s.cwd || '' }, s.workspace || '—')),
                      h('td', { className: 'num' }, num(s.steps)),
                      h('td', { className: 'num' }, short(bk(s.totals, 'outputTokens'))),
                      narrow ? null : h('td', { className: 'num' }, short(bk(s.totals, 'cacheReadTokens'))),
                      h(
                        'td',
                        { className: 'num' },
                        h(
                          'div',
                          { className: 'barcell' },
                          h('span', null, short(bk(s.totals, 'totalTokens'))),
                          h('span', { className: 'track' }, h('i', { style: { width: `${Math.max(3, (bk(s.totals, 'totalTokens') / maxTotal) * 100)}%` } }))
                        )
                      ),
                      h(
                        'td',
                        null,
                        narrow
                          ? h('span', { className: 'mono' }, (s.lastTimeText || '').slice(5, 16))
                          : h(
                              'div',
                              { className: 'mini' },
                              Array.from({ length: miniDays }, (_, i) => {
                                const key = dayKey(addDays(today, -(miniDays - 1 - i)));
                                const value = bk((s.days || {})[key], 'totalTokens');
                                const strength = value ? clamp(Math.round((value / maxTotal) * 400), 25, 100) : 0;
                                return h('i', {
                                  key,
                                  style: value ? { background: `color-mix(in srgb,var(--dshtu-accent) ${strength}%,transparent)` } : undefined,
                                  title: `${key} · ${num(value)} tokens`,
                                });
                              })
                            )
                      )
                    )
                  )
            )
          )
        )
      );

      // ---------------- 分组表 ----------------
      function groupTable(title, groups, firstCol) {
        const entries = Object.entries(groups || {}).sort((a, b) => bk(b[1].bucket, 'totalTokens') - bk(a[1].bucket, 'totalTokens'));
        return h(
          'div',
          null,
          h('div', { className: 'hd' }, h('h3', null, title)),
          entries.length === 0
            ? h('div', { className: 'empty' }, t('noData'))
            : h(
                'div',
                { className: 'scroll' },
                h(
                  'table',
                  null,
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', { className: 'nosort' }, firstCol),
                      h('th', { className: 'nosort' }, t('colSteps')),
                      h('th', { className: 'nosort' }, t('shortInput')),
                      h('th', { className: 'nosort' }, t('output')),
                      h('th', { className: 'nosort' }, t('shortCache')),
                      h('th', { className: 'nosort' }, t('sum'))
                    )
                  ),
                  h(
                    'tbody',
                    null,
                    entries.map(([name, entry]) =>
                      h(
                        'tr',
                        { key: name },
                        h('td', { className: 'cellwrap', style: { maxWidth: narrow ? 120 : 250 } }, h('span', { className: 'ttl', title: name }, name)),
                        h('td', { className: 'num' }, entry.steps == null ? '—' : num(entry.steps)),
                        h('td', { className: 'num' }, short(bk(entry.bucket, 'inputTokens'))),
                        h('td', { className: 'num' }, short(bk(entry.bucket, 'outputTokens'))),
                        h('td', { className: 'num' }, short(bk(entry.bucket, 'cacheReadTokens'))),
                        h('td', { className: 'num' }, short(bk(entry.bucket, 'totalTokens')))
                      )
                    )
                  )
                )
              )
        );
      }

      // ---------------- 成本 ----------------
      const priceInputs = [
        { key: 'pIn', label: t('priceIn') },
        { key: 'pOut', label: t('priceOut') },
        { key: 'pCache', label: t('priceCache') },
        { key: 'pWrite', label: t('priceWrite') },
      ];
      const cost = h(
        'div',
        { className: 'sec' },
        h('div', { className: 'hd' }, h('h3', null, t('costTitle')), h('span', { className: 'hint' }, t('costHint'))),
        h(
          'div',
          { className: 'prices' },
          priceInputs.map((input) =>
            h(
              'label',
              { key: input.key },
              input.label,
              h('input', {
                type: 'number',
                min: '0',
                step: '0.01',
                value: prices[input.key] || '',
                placeholder: '—',
                onChange: (e) => savePrice(input.key, e.target.value === '' ? 0 : Number(e.target.value)),
              })
            )
          )
        ),
        h(
          'div',
          { className: 'costfoot' },
          h('span', null, priceEnabled(prices) ? t('costOn') : t('costOff')),
          totalCost !== null ? h('span', { className: 'num' }, `${t('total')} ${money(totalCost)}`) : null,
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', onClick: () => priceInputs.forEach((input) => savePrice(input.key, 0)) }, t('clear'))
        )
      );

      return h(
        'div',
        { className: 'dshtu', ref: rootRef },
        head,
        metrics,
        heatmap,
        dayPanel,
        chart,
        sessions,
        h(
          'div',
          { className: 'sec' },
          h(
            'div',
            { className: 'groups' },
            groupTable(t('modelTitle'), data.byModel, t('colModel')),
            groupTable(t('workspaceTitle'), data.byWorkspace, t('workspaceTitle'))
          )
        ),
        cost,
        tipEl
      );
    }

    // ------------------------------------------------------------------
    // 插件入口
    // ------------------------------------------------------------------
    /** 面板内部出错时只替换自己，不拖垮设置界面。 */
    class TokenUsageBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error: String((error && error.message) || error) };
      }
      render() {
        if (this.state.error !== null) {
          return h('div', { className: 'dshtu' }, h('div', { className: 'mut' }, 'Token 用量面板出错：', this.state.error));
        }
        return this.props.children;
      }
    }

    function TokenUsageSectionSafe(props) {
      return h(TokenUsageBoundary, null, h(TokenUsageSection, props));
    }

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }));
      const t = ctx.locale.bind(NS);

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'token-usage',
            order: 20,
            locale: NS,
            label: () => t('nav'),
            inject: () => ({ t }),
          },
          TokenUsageSectionSafe
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
