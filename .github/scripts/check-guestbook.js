const https = require('https');
const fs = require('fs');
const path = require('path');

const PUSHPLUS_TOKEN = process.env.PUSHPLUS_TOKEN;
const JSONBLOB_ID = process.env.JSONBLOB_ID;
const STATE_FILE = path.join(__dirname, '../../data/guestbook_state.json');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
        } else reject(new Error('HTTP ' + res.statusCode + ': ' + d.substring(0, 200)));
      });
    }).on('error', reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
        } else reject(new Error('HTTP ' + res.statusCode + ': ' + d.substring(0, 200)));
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  // Read state
  let state = { lastTime: '1970-01-01T00:00:00.000Z' };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }

  // Fetch messages from JSONBlob
  const data = await get('https://api.jsonblob.com/blobs/' + JSONBLOB_ID);
  const messages = data.messages || [];

  // Filter new messages
  const newMessages = messages.filter(m => m.time > state.lastTime);
  if (newMessages.length === 0) {
    console.log('No new messages.');
    return;
  }

  console.log('Found ' + newMessages.length + ' new message(s).');

  // Send PushPlus notification for each new message
  for (const msg of newMessages) {
    const title = '💬 新留言通知';
    const content =
      '<h3>💬 有人留言了！</h3>' +
      '<p><strong>地点：</strong>' + (msg.location || '未知') + '</p>' +
      '<p><strong>时间：</strong>' + new Date(msg.time).toLocaleString('zh-CN') + '</p>' +
      '<p><strong>内容：</strong></p>' +
      '<blockquote style="background:#f5f5f5;padding:10px;border-left:4px solid #0088ff;margin:10px 0">' + msg.text + '</blockquote>' +
      '<hr>' +
      '<p><a href="https://gongtongfeng.github.io/my-project/#guestbook">👉 点击查看留言板</a></p>';

    await post('http://www.pushplus.plus/send', {
      token: PUSHPLUS_TOKEN,
      title: title,
      content: content,
      template: 'html'
    });

    console.log('Sent notification for message at ' + msg.time);

    if (msg.time > state.lastTime) {
      state.lastTime = msg.time;
    }
  }

  // Write updated state
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('Updated state: lastTime = ' + state.lastTime);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
