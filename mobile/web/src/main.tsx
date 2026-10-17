import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

// Service Worker 只缓存静态资源（见 public/sw.js）；开发模式不注册，免得缓存干扰 HMR
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => { /* 非 HTTPS 环境注册会失败，不影响使用 */ })
  })
}
