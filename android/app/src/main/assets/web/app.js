// WorkBuddy Mobile 交互逻辑

let currentTab = 'overview';
let generatedKey = '';

document.addEventListener('DOMContentLoaded', () => {
  loadOverview();
  setInterval(() => {
    if (document.visibilityState === 'visible' && currentTab === 'overview') {
      loadOverview();
    }
  }, 15000);
});

// Tab 切换
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const view = document.getElementById(`view-${tab}`);
  if (view) view.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add('active');

  if (tab === 'overview') loadOverview();
  if (tab === 'accounts') loadAccounts();
  if (tab === 'keys') loadKeys();
}

// 1. 概览
async function loadOverview() {
  const statusDot = document.getElementById('headerStatusText');
  try {
    const res = await fetch('/m/api/overview');
    if (!res.ok) throw new Error('网络异常');
    const data = await res.json();

    const isOnline = data.status === 'online';
    statusDot.textContent = isOnline ? '网关在线' : '网关离线';
    document.getElementById('headerStatus').style.color = isOnline ? 'var(--primary)' : 'var(--danger)';
    document.getElementById('headerStatus').style.background = isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';

    document.getElementById('statAccounts').textContent = `${data.accounts.active} / ${data.accounts.total}`;
    document.getElementById('statTodayReq').textContent = data.stats.today_requests.toLocaleString();
    document.getElementById('statTodayTokens').textContent = data.stats.today_tokens.toLocaleString();
    document.getElementById('statActiveKeys').textContent = data.stats.active_keys;
    document.getElementById('infoCoreUrl').textContent = data.core_url;
  } catch (e) {
    statusDot.textContent = '连接中断';
    document.getElementById('headerStatus').style.color = 'var(--danger)';
  }
}

// 2. 账号
async function loadAccounts() {
  const container = document.getElementById('accountList');
  try {
    const res = await fetch('/m/api/accounts');
    const data = await res.json();
    const accounts = data.accounts || [];
    document.getElementById('accountCount').textContent = accounts.length;

    if (accounts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-dim);">
          暂无账号，点击上方「+ 授权新账号」快速添加
        </div>`;
      return;
    }

    container.innerHTML = accounts.map(a => {
      const initial = (a.nickname || 'U').charAt(0).toUpperCase();
      const isOnline = a.in_pool && !a.disabled && !a.cooling;
      const statusClass = isOnline ? 'tag-online' : 'tag-offline';
      const statusText = isOnline ? '● 在线' : (a.disabled ? '● 已停用' : '● 冷却中');
      const realmText = a.realm === 'global' ? '国际版' : '国内版';

      return `
        <div class="item-card">
          <div class="item-main">
            <div class="item-avatar">${initial}</div>
            <div class="item-info">
              <div class="item-title">
                <span>${escapeHtml(a.nickname)}</span>
                <span class="tag tag-global">${realmText}</span>
                <span class="tag ${statusClass}">${statusText}</span>
              </div>
              <div class="item-sub">UID: ${escapeHtml(a.uid)} · 有效期约 ${a.remain_days} 天</div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="copyText('${escapeHtml(a.uid)}')">复制UID</button>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--danger);">加载失败: ${e.message}</div>`;
  }
}

// 授权弹窗
function openAuthModal() {
  document.getElementById('authModal').classList.add('active');
  document.getElementById('authResultArea').style.display = 'none';
  document.getElementById('startAuthBtn').style.display = 'block';
}

async function requestAuthLink() {
  const region = document.getElementById('authRegion').value;
  const btn = document.getElementById('startAuthBtn');
  btn.disabled = true;
  btn.textContent = '正在获取链接...';

  try {
    const res = await fetch('/m/api/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ realm: 'global', region })
    });
    const data = await res.json();
    if (data.authUrl) {
      document.getElementById('authLinkBtn').href = data.authUrl;
      document.getElementById('authResultArea').style.display = 'block';
      btn.style.display = 'none';
    } else {
      alert('获取授权链接失败：' + (data.detail || JSON.stringify(data)));
    }
  } catch (e) {
    alert('请求失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '获取授权链接';
  }
}

// 3. 密钥
async function loadKeys() {
  const container = document.getElementById('keyList');
  try {
    const res = await fetch('/m/api/keys');
    const data = await res.json();
    const keys = Array.isArray(data) ? data : (data.items || []);

    if (keys.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-dim);">
          暂无密钥，点击上方「+ 创建密钥」生成一个
        </div>`;
      return;
    }

    container.innerHTML = keys.map(k => `
      <div class="item-card">
        <div class="item-main">
          <div class="item-info">
            <div class="item-title">
              <span>${escapeHtml(k.name || '未命名')}</span>
              <span class="tag tag-online">${k.enabled ? '已启用' : '已停用'}</span>
            </div>
            <div class="item-sub">前缀: ${escapeHtml(k.prefix || 'wbk_***')} · 用量: ${k.used_tokens || 0} tokens</div>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" onclick="copyText('${escapeHtml(k.prefix)}')">复制</button>
          <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="deleteKey(${k.id})">删除</button>
        </div>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--danger);">加载密钥失败: ${e.message}</div>`;
  }
}

function openNewKeyModal() {
  document.getElementById('newKeyModal').classList.add('active');
  document.getElementById('newKeyName').value = 'Mobile-Key';
  document.getElementById('newKeyResult').style.display = 'none';
  document.getElementById('createKeyBtn').style.display = 'block';
}

async function submitCreateKey() {
  const name = document.getElementById('newKeyName').value.trim();
  const btn = document.getElementById('createKeyBtn');
  btn.disabled = true;

  try {
    const res = await fetch('/m/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.key) {
      generatedKey = data.key;
      document.getElementById('newKeyText').textContent = data.key;
      document.getElementById('newKeyResult').style.display = 'block';
      btn.style.display = 'none';
      loadKeys();
    } else {
      alert('创建失败：' + JSON.stringify(data));
    }
  } catch (e) {
    alert('请求失败：' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function deleteKey(id) {
  if (!confirm('确认删除该密钥吗？')) return;
  try {
    await fetch(`/m/api/keys/${id}`, { method: 'DELETE' });
    loadKeys();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

function copyGeneratedKey() {
  if (generatedKey) copyText(generatedKey);
}

function copyBaseUrl() {
  copyText('http://127.0.0.1:8795/v1');
}

// 4. 即时对话工作台 (SSE 流式)
let chatHistory = [];

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const model = document.getElementById('chatModelSelect').value;
  input.value = '';
  const messagesBox = document.getElementById('chatMessages');

  // 用户气泡
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = text;
  messagesBox.appendChild(userBubble);

  chatHistory.push({ role: 'user', content: text });

  // Assistant 气泡占位
  const aiBubble = document.createElement('div');
  aiBubble.className = 'chat-bubble assistant';
  aiBubble.innerHTML = '<span style="color: var(--text-dim);">思考中...</span>';
  messagesBox.appendChild(aiBubble);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  let assistantContent = '';
  let thinkingContent = '';

  try {
    const response = await fetch('/m/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: chatHistory
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    aiBubble.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.error) {
              assistantContent += `\n[错误: ${parsed.error}]`;
            } else if (parsed.choices && parsed.choices[0]) {
              const delta = parsed.choices[0].delta || {};
              if (delta.reasoning_content) {
                thinkingContent += delta.reasoning_content;
              }
              if (delta.content) {
                assistantContent += delta.content;
              }
            }
          } catch (err) {}
        }
      }

      // 实时渲染
      let html = '';
      if (thinkingContent) {
        html += `<div class="thinking-block">💭 ${escapeHtml(thinkingContent)}</div>`;
      }
      html += escapeHtml(assistantContent) || '<span style="color: var(--text-dim);">输入中...</span>';
      aiBubble.innerHTML = html;
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    chatHistory.push({ role: 'assistant', content: assistantContent });
  } catch (e) {
    aiBubble.textContent = `发送失败: ${e.message}`;
  } finally {
    sendBtn.disabled = false;
  }
}

// 通用工具
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function copyText(str) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(str).then(() => alert('已复制到剪贴板！'));
  } else {
    alert('复制内容：\n' + str);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
