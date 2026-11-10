// Discord auto-start retries network errors (DNS not ready at boot) but not real failures.
const assert = require('assert');
const bot = require('../lib/discord-bot');

(async () => {
  const realStart = bot.start;
  let calls = 0;
  bot.start = async () => { if (++calls < 2) throw new Error('getaddrinfo EAI_AGAIN discord.com'); return 'ok'; };
  const t0 = Date.now();
  assert.strictEqual(await bot.startWithRetry({}, () => {}), 'ok');
  assert.strictEqual(calls, 2, 'retried once after the DNS error');
  assert(Date.now() - t0 >= 4500, 'waited before retrying');

  calls = 0;
  bot.start = async () => { calls++; throw new Error('401: invalid token'); };
  await assert.rejects(bot.startWithRetry({}, () => {}), /invalid token/);
  assert.strictEqual(calls, 1, 'a bad token is not retried');

  bot.start = realStart;
  console.log(' ✔ ALL DISCORD-RETRY TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
