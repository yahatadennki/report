// ═══════════════════════════════════════════════════════════════
//  円メーター「AIの読み」（お試し）
//    直近のニュース見出し（報道・日銀・FRB）を Claude に読ませて、
//    円高材料か円安材料かを短くまとめる。金利メーター（fundamentals.js）とは別枠。
//    ・1日2回（日本時間 7時台・19時台）。15分ごとの checkMackline から fundaAiTick_ が呼ばれる
//    ・お試し期限（FUNDA_AI.until）を過ぎると自動で止まり、アプリからも消える
//    ・APIキーはスクリプトプロパティ ANTHROPIC_API_KEY（ソースには書かない）
// ═══════════════════════════════════════════════════════════════

var FUNDA_AI = {
  until: '2026-11-18T00:00:00+09:00',   // 11/17 いっぱいまで
  slots: [7, 19],                        // 日本時間の何時台に読むか
  maxCalls: 24,                          // 期間中の呼び出し回数の上限（使いすぎ防止）
  minGapMin: 180,                        // 前回から最低これだけ空ける
  model: 'claude-opus-5-5',
  feeds: [
    { name: '報道', max: 45, hours: 26, url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('ドル円 OR 日銀 OR FRB OR 為替介入 when:1d') + '&hl=ja&gl=JP&ceid=JP:ja' },
    { name: '日銀', max: 10, hours: 72, url: 'https://www.boj.or.jp/rss/whatsnew.xml' },
    { name: 'FRB', max: 8, hours: 72, url: 'https://www.federalreserve.gov/feeds/press_all.xml' }
  ]
};

function fundaAiOn_() { return Date.now() < new Date(FUNDA_AI.until).getTime(); }

// 15分ごとに呼ばれる。読む時間帯で、まだ読んでいなければ1回だけ読む（失敗時は同じ時間帯にもう1回だけ試す）
function fundaAiTick_() {
  if (!fundaAiOn_()) return 'AIの読み：お試し終了';
  var p = PropertiesService.getScriptProperties();
  var now = new Date();
  var hour = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));
  if (FUNDA_AI.slots.indexOf(hour) < 0) return 'AIの読み：時間外';
  var key = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd-HH');
  var st = {};
  try { st = JSON.parse(p.getProperty('FUNDA_AI_SLOT') || '{}'); } catch (e) {}
  if (st.key === key && (st.ok || st.tries >= 2)) return 'AIの読み：この時間帯は済み';
  st = { key: key, tries: (st.key === key ? st.tries : 0) + 1, ok: false };
  p.setProperty('FUNDA_AI_SLOT', JSON.stringify(st));
  var r = fundaAiRun_();
  if (r.indexOf('OK') === 0) { st.ok = true; p.setProperty('FUNDA_AI_SLOT', JSON.stringify(st)); }
  return 'AIの読み：' + r;
}

// 1回読む。結果は Property FUNDA_AI_V1 に入れる（失敗した時は前回の結果を残す）
function fundaAiRun_() {
  if (!fundaAiOn_()) return 'お試し終了';
  var p = PropertiesService.getScriptProperties();
  var apiKey = p.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return 'APIキー未設定';
  var calls = Number(p.getProperty('FUNDA_AI_CALLS') || 0);
  if (calls >= FUNDA_AI.maxCalls) return '回数の上限（' + FUNDA_AI.maxCalls + '回）に達しました';
  var last = Number(p.getProperty('FUNDA_AI_LAST') || 0);
  if (Date.now() - last < FUNDA_AI.minGapMin * 60e3) return '前回から' + FUNDA_AI.minGapMin + '分たっていません';
  try {
    var heads = fundaAiHeads_();
    if (heads.count < 5) throw new Error('見出しが足りません（' + heads.count + '件）');
    var rates = null;
    try { rates = fundaCached_('FUNDA_RATES_V1', 3 * 3600, fundaRates_); } catch (e) {}
    var body = fundaAiBody_(heads.text, rates, new Date());
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      payload: JSON.stringify(body)
    });
    var code = res.getResponseCode();
    if (code !== 200) throw new Error('API ' + code + ' ' + res.getContentText().slice(0, 200));
    p.setProperty('FUNDA_AI_LAST', String(Date.now()));   // 課金が発生した呼び出しだけ数える
    p.setProperty('FUNDA_AI_CALLS', String(calls + 1));
    var msg = JSON.parse(res.getContentText());
    if (msg.stop_reason !== 'end_turn') throw new Error('途中で止まりました（' + msg.stop_reason + '）');
    var out = fundaAiParse_(msg);
    out.at = new Date().toISOString();
    out.heads = heads.count;
    out.usage = { i: msg.usage.input_tokens, o: msg.usage.output_tokens };
    p.setProperty('FUNDA_AI_V1', JSON.stringify(out));
    return 'OK ' + out.items.length + '件（入力' + out.usage.i + '・出力' + out.usage.o + 'トークン）';
  } catch (e) {
    p.setProperty('FUNDA_AI_ERR', new Date().toISOString() + ' ' + String(e).slice(0, 300));
    return '失敗 ' + String(e).slice(0, 200);
  }
}

// アプリへ返す分（期限内だけ）
function fundaAiForApp_() {
  if (!fundaAiOn_()) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('FUNDA_AI_V1');
  if (!raw) return null;
  var o = JSON.parse(raw);
  return { at: o.at, lean: o.lean, summary: o.summary, items: o.items, until: FUNDA_AI.until };
}

// ── 見出しを集める ──
function fundaAiHeads_() {
  var lines = [], count = 0;
  FUNDA_AI.feeds.forEach(function(f) {
    try {
      var res = UrlFetchApp.fetch(f.url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return;
      var items = fundaRssItems_(res.getContentText('UTF-8'), f.hours, f.max, Date.now());
      if (!items.length) return;
      lines.push('【' + f.name + '】');
      items.forEach(function(it) {
        lines.push('- ' + Utilities.formatDate(new Date(it.t), 'Asia/Tokyo', 'M/d HH:mm') + ' ' + it.title);
        count++;
      });
    } catch (e) {}
  });
  return { text: lines.join('\n'), count: count };
}

// RSS から「見出しと時刻」だけを取り出す（新しい順、同じ見出しは1つに）
function fundaRssItems_(xml, hours, max, nowMs) {
  var out = [], seen = {};
  var parts = xml.split('<item');
  for (var i = 1; i < parts.length; i++) {
    var seg = parts[i];
    var title = fundaRssTag_(seg, 'title');
    var t = new Date(fundaRssTag_(seg, 'pubDate')).getTime();
    if (!title || isNaN(t)) continue;
    if (nowMs - t > hours * 3600e3) continue;
    var k = title.replace(/\s+/g, '').slice(0, 24);
    if (seen[k]) continue;
    seen[k] = 1;
    out.push({ t: t, title: title });
  }
  out.sort(function(a, b) { return b.t - a.t; });
  return out.slice(0, max);
}
function fundaRssTag_(seg, name) {
  var a = seg.indexOf('<' + name), b = seg.indexOf('</' + name + '>');
  if (a < 0 || b < 0) return '';
  var s = seg.slice(seg.indexOf('>', a) + 1, b).replace('<![CDATA[', '').replace(']]>', '');
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ── Claude への依頼文 ──
function fundaAiSystem_() {
  return [
    'あなたはドル円のファンダメンタルズを読む担当です。',
    '個人が自分用に使う「円メーター」という画面に、直近のニュースが円高の材料なのか円安の材料なのかを短く表示します。読む人は為替の専門家ではないので、専門用語を避け、平易な日本語で書いてください（例：「タカ派」→「利上げに前向き」）。',
    '',
    '渡すのは、直近の見出し一覧（報道・日銀・FRB、時刻は日本時間）と、金利の現状です。本文は渡しません。',
    '',
    '拾うもの：値動きの原因になる出来事。金融政策と中央銀行の要人の発言、経済指標の結果、政府・日銀の為替介入への姿勢、財政や政治の動き、世界的な不安（リスク回避）など。',
    '拾わないもの：相場の動きそのものを伝える見出し（「ドル円が上昇」「158円台」など）、注文状況、チャート分析、今後の見通しを語るだけの記事。この画面はチャートではなく出来事から判断するためのものです。',
    '同じ出来事を伝える見出しは1つにまとめます。見出しだけでは向きが判断できないものは「中立」にするか、載せません。見出しに無いことを付け足さないでください。',
    '材料がほとんど無い日は、無理に埋めず、件数を減らして summary にそう書いてください。',
    '',
    '出力は次の形のJSONだけにしてください（前置きやコードブロックの記号は付けない）。',
    '{',
    '  "lean": 全体としてどちらに傾いているか。-2=はっきり円高 / -1=やや円高 / 0=どちらとも言えない / 1=やや円安 / 2=はっきり円安 の整数,',
    '  "summary": "全体を1〜2文で。70字以内",',
    '  "items": [ 重要な順に最大5件',
    '    { "dir": "円安" か "円高" か "中立", "title": "出来事を25字以内で", "why": "なぜその向きなのかを45字以内で" }',
    '  ]',
    '}'
  ].join('\n');
}
function fundaAiBody_(headsText, rates, now) {
  var ctx = '今は日本時間 ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日 HH:mm') + ' です。\n';
  if (rates && rates.us10) {
    ctx += '金利の現状：アメリカ 2年 ' + rates.us2 + '%・10年 ' + rates.us10 + '%（' + rates.usDate + '）／日本 2年 ' + rates.jp2 + '%・10年 ' + rates.jp10 + '%（' + rates.jpDate + '）\n';
  }
  return {
    model: FUNDA_AI.model,
    max_tokens: 16000,
    fallbacks: 'default',
    system: fundaAiSystem_(),
    messages: [{ role: 'user', content: ctx + '\n直近の見出し：\n' + headsText }]
  };
}

// 返ってきた文章からJSONを取り出して形を確かめる
function fundaAiParse_(msg) {
  var text = '';
  (msg.content || []).forEach(function(b) { if (b.type === 'text') text += b.text; });
  var a = text.indexOf('{'), z = text.lastIndexOf('}');
  if (a < 0 || z < 0) throw new Error('JSONが見つかりません');
  var o = JSON.parse(text.slice(a, z + 1));
  var lean = Math.max(-2, Math.min(2, Math.round(Number(o.lean) || 0)));
  var items = (Array.isArray(o.items) ? o.items : []).slice(0, 5).map(function(x) {
    var d = String(x.dir || '');
    return { dir: d === '円安' || d === '円高' ? d : '中立', title: String(x.title || '').slice(0, 40), why: String(x.why || '').slice(0, 80) };
  }).filter(function(x) { return x.title; });
  return { lean: lean, summary: String(o.summary || '').slice(0, 140), items: items };
}

// 点検用：?action=funda_ai_diag
function fundaAiDiag_() {
  var p = PropertiesService.getScriptProperties();
  var lines = [];
  lines.push('お試し：' + (fundaAiOn_() ? '実施中（' + FUNDA_AI.until + ' まで）' : '終了'));
  lines.push('APIキー：' + (p.getProperty('ANTHROPIC_API_KEY') ? '設定済み' : '未設定'));
  lines.push('呼び出し回数：' + (p.getProperty('FUNDA_AI_CALLS') || 0) + ' / ' + FUNDA_AI.maxCalls);
  lines.push('時間帯の記録：' + (p.getProperty('FUNDA_AI_SLOT') || 'なし'));
  lines.push('最後の失敗：' + (p.getProperty('FUNDA_AI_ERR') || 'なし'));
  try { lines.push('見出し：' + fundaAiHeads_().count + '件 取れています'); } catch (e) { lines.push('見出し：取得エラー ' + e); }
  var raw = p.getProperty('FUNDA_AI_V1');
  lines.push('いまの結果：' + (raw ? raw.slice(0, 1200) : 'なし'));
  return lines.join('\n');
}
