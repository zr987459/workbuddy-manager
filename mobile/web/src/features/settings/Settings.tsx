import {api, conn} from '../../lib/api';
import {useAsync} from '../../lib/hooks';
import {go} from '../../lib/router';
import type {Realm} from '../../lib/types';
import {ErrorBanner, Header, Segmented, Skeleton, useToast} from '../../ui/kit';

export default function Settings({onLogout}: {onLogout: () => void}) {
  const s = useAsync(() => api.settings());
  const toast = useToast();
  const setRealm = async (realm: Realm) => {
    try { const r = await api.saveSettings({realm}); s.data && s.set({...s.data, prefs: r.prefs}); toast('已切换', 'ok'); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  return (
    <div className="page">
      <Header title="设置" right={<button className="btn-text" onClick={() => history.length > 1 ? history.back() : go('/')}>完成</button>} />
      {s.error && <ErrorBanner message={s.error} onRetry={s.reload} />}
      {!s.data && !s.error && <Skeleton n={2} />}
      {s.data && (
        <>
          <section className="card">
            <div className="kv"><span>登录用户</span><span>{s.data.user.username}（{s.data.user.role === 'admin' ? '管理员' : '只读'}）</span></div>
            <div className="kv"><span>核心服务</span><span className="mono small">{s.data.core_url}</span></div>
            <div className="kv"><span>版本</span><span>{s.data.version}</span></div>
          </section>
          <section className="card">
            <h3>默认版本</h3>
            <Segmented<Realm> value={s.data.prefs.realm} onChange={setRealm}
              options={[{value: 'global', label: '国际版'}, {value: 'cn', label: '国内版'}]} />
            <p className="muted small">影响概览、账号、密钥和对话的默认范围。</p>
          </section>
        </>
      )}
      <button className="btn danger block" onClick={async () => { await api.logout().catch(() => {}); conn.set(conn.server, ''); onLogout(); }}>退出登录</button>
    </div>
  );
}
