import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TIMEOUT = 30_000;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function testTool(client, name, args) {
  try {
    const result = await withTimeout(client.callTool({ name, arguments: args }), TIMEOUT);
    const text = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || JSON.stringify(result.content);
    const preview = text.slice(0, 150).replace(/\n/g, ' ');
    const isError = result.isError || text.toLowerCase().includes('error') || text.includes('Traceback');
    console.log(`${isError ? 'FAIL' : ' OK '} | ${name} | ${preview}`);
    return { name, ok: !isError, preview };
  } catch (err) {
    console.log(`FAIL | ${name} | ${err.message.slice(0, 100)}`);
    return { name, ok: false, preview: err.message };
  }
}

async function testServer(command, args, tests) {
  const transport = new StdioClientTransport({ command, args, env: { ...process.env } });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await withTimeout(client.connect(transport), TIMEOUT);
  console.log(`\n=== ${command} ${args.join(' ')} ===`);
  for (const t of tests) {
    await testTool(client, t.name, t.args);
  }
  await client.close();
}

// Yahoo Finance tests
await testServer('npx', ['-y', 'yfinance-mcp'], [
  { name: 'search_symbols', args: { query: 'BYD' } },
  { name: 'get_quote', args: { symbol: '002594.SZ' } },
  { name: 'get_quote', args: { symbol: '1211.HK' } },
  { name: 'get_historical', args: { symbol: '002594.SZ', period: '1mo' } },
  { name: 'get_financials', args: { symbol: '002594.SZ' } },
  { name: 'get_company_info', args: { symbol: '002594.SZ' } },
  { name: 'get_news', args: { symbol: 'BYD' } },
]);

// AKShare tests
await testServer('uvx', ['akshare-mcp-server'], [
  { name: 'stock_zh_a_spot', args: {} },
  { name: 'stock_zh_a_hist', args: { symbol: '002594', period: 'daily', start_date: '20260101', end_date: '20260228', adjust: 'qfq' } },
  { name: 'stock_zh_index_spot', args: {} },
  { name: 'stock_zh_index_daily', args: { symbol: 'sh000001', period: 'daily' } },
  { name: 'fund_etf_category_sina', args: { category: '封闭式基金' } },
  { name: 'fund_etf_hist_sina', args: { symbol: 'sz159915' } },
  { name: 'macro_china_gdp', args: {} },
  { name: 'macro_china_cpi', args: {} },
  { name: 'forex_spot_quote', args: {} },
  { name: 'futures_zh_spot', args: {} },
  { name: 'bond_zh_hs_cov_spot', args: {} },
  { name: 'stock_zt_pool_strong_em', args: {} },
]);

console.log('\nDone.');
