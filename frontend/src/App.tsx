import { T, type Screen } from './data';
import { useDashboard } from './useDashboard';
import ScanScreen from './screens/ScanScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import NetworkScreen from './screens/NetworkScreen';
import ReportsScreen from './screens/ReportsScreen';

const SCREENS: Screen[] = ['scan', 'discovery', 'network', 'reports'];

export default function App() {
  const dash = useDashboard();
  const { state: s, set, toggleDemo } = dash;
  const t = T[s.lang], ar = s.lang === 'ar', wide = !s.narrow;

  const navButtons = SCREENS.map((k) => (
    <button key={k} className={s.screen === k ? 'on' : ''} aria-current={s.screen === k ? 'page' : undefined} onClick={() => set({ screen: k })}>
      {t[k]}
    </button>
  ));

  return (
    <div className={`app${s.narrow ? ' narrow' : ''}`} dir={ar ? 'rtl' : 'ltr'} lang={s.lang}>
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name" dir="ltr">ScamShield AI</span>
        </div>
        <div className="header-right">
          <span className="health-dot" title={s.online || s.lite ? 'API online' : s.online === false ? 'API offline' : 'Checking API'}
            style={{ background: s.online || s.lite ? '#6B8E5A' : s.online === false ? '#C99A2E' : '#D3CFC6' }} />
          <button className="link-btn" onClick={toggleDemo}>{s.demo ? t.stopDemo : t.demo}</button>
          {wide && <span className="partner">{t.partner}</span>}
          <div className="lang-switch" role="group" aria-label="Language">
            <button className={!ar ? 'on' : ''} aria-pressed={!ar} onClick={() => set({ lang: 'en' })}>EN</button>
            <button className={`ar${ar ? ' on' : ''}`} aria-pressed={ar} onClick={() => set({ lang: 'ar' })}>ع</button>
          </div>
        </div>
      </header>
      {s.online === false && !s.lite && <div className="offline-banner" role="status">{t.offline}</div>}

      <div className="body">
        {wide && <nav className="side-nav">{navButtons}</nav>}
        <main className="main">
          {s.screen === 'scan' && <ScanScreen dash={dash} />}
          {s.screen === 'discovery' && <DiscoveryScreen dash={dash} />}
          {s.screen === 'network' && <NetworkScreen dash={dash} />}
          {s.screen === 'reports' && <ReportsScreen dash={dash} />}
          {s.narrow && <p className="foot-partner">{t.partner}</p>}
        </main>
      </div>

      {s.narrow && <nav className="bottom-nav">{navButtons}</nav>}

      {s.demo && (
        <div className="demo-bar">
          <div className="demo-card">
            <span className="demo-count" dir="ltr">{`${s.demoStep + 1} / 4`}</span>
            <span className="demo-caption">{t.demoCaps[s.demoStep]}</span>
            <button className="link-btn" onClick={toggleDemo}>{t.stop}</button>
          </div>
        </div>
      )}
    </div>
  );
}
