import { useEffect, useState } from 'react';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';

interface WeatherDay {
  date?: string;
  day?: string;
  temp?: number;
  tempMax?: number;
  tempMin?: number;
  icon?: string;
  condition?: string;
}

interface WeatherData {
  temp?: number;
  condition?: string;
  city?: string;
  icon?: string;
  humidity?: number;
  wind?: number;
  forecast?: WeatherDay[];
}

interface WeatherResponse {
  status: 'ok' | 'error' | 'not_configured';
  data?: WeatherData | null;
  error?: string;
  cached?: boolean;
}

const ICON_MAP: Record<string, string> = {
  clear: '☀️', sunny: '☀️', sole: '☀️',
  cloud: '⛅', clouds: '☁️', overcast: '☁️', nuvoloso: '☁️',
  rain: '🌧️', pioggia: '🌧️', shower: '🌦️',
  snow: '❄️', neve: '❄️',
  fog: '🌫️', nebbia: '🌫️',
  storm: '⛈️', thunder: '⛈️',
};

function pickIcon(condition?: string): string {
  if (!condition) return '🌡️';
  const c = condition.toLowerCase();
  for (const [k, emoji] of Object.entries(ICON_MAP)) {
    if (c.includes(k)) return emoji;
  }
  return '🌡️';
}

export function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch('/api/assistant/weather');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json() as WeatherResponse;
        if (cancelled) return;
        if (json.status === 'ok' && json.data) {
          setData(json.data);
          setStatus('ok');
        } else {
          setError(json.error || 'Nessun dato');
          setStatus('error');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Errore rete');
        setStatus('error');
      }
    }
    setStatus('loading');
    void load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [reloadKey]);

  if (status === 'loading') {
    return <WidgetSpinner label="Caricamento meteo…" fullHeight />;
  }
  if (status === 'error' || !data) {
    return <WidgetError message={error || 'Meteo offline'} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const temp = data.temp !== undefined ? Math.round(data.temp) : null;
  const icon = data.icon || pickIcon(data.condition);
  const forecast = (data.forecast || []).slice(0, 4);

  function condKey(c?: string): string {
    if (!c) return 'default';
    const x = c.toLowerCase();
    if (/storm|thunder|temporale/.test(x)) return 'storm';
    if (/snow|neve/.test(x)) return 'snow';
    if (/rain|pioggia|shower/.test(x)) return 'rain';
    if (/cloud|overcast|nuvol/.test(x)) return 'cloud';
    if (/fog|nebbia|mist/.test(x)) return 'fog';
    if (/clear|sun|sole/.test(x)) return 'clear';
    return 'default';
  }
  const condition = condKey(data.condition);

  return (
    <div className="kc-w-weather" data-cond={condition}>
      <div className="kc-w-weather-row">
        <span className="kc-w-weather-icon" data-cond={condition}>{icon}</span>
        <div className="kc-w-weather-main">
          <div className="kc-w-weather-temp">{temp !== null ? `${temp}°` : '—'}</div>
          <div className="kc-w-weather-cond">{data.condition || '—'}</div>
        </div>
      </div>
      {data.city ? <div className="kc-w-weather-city">{data.city}</div> : null}
      {forecast.length > 0 ? (
        <div className="kc-w-weather-forecast">
          {forecast.map((f, i) => {
            const fCond = condKey(f.condition);
            return (
              <div key={i} className="kc-w-weather-day" data-cond={fCond}>
                <span className="kc-w-weather-day-name">
                  {f.day || (f.date ? new Date(f.date).toLocaleDateString('it-IT', { weekday: 'short' }) : '—')}
                </span>
                <span className="kc-w-weather-day-icon">{f.icon || pickIcon(f.condition)}</span>
                <span className="kc-w-weather-day-temp">
                  {f.tempMax !== undefined ? `${Math.round(f.tempMax)}°` : (f.temp !== undefined ? `${Math.round(f.temp)}°` : '—')}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {(data.humidity !== undefined || data.wind !== undefined) ? (
        <div className="kc-w-weather-meta">
          {data.humidity !== undefined ? <span>💧 {data.humidity}%</span> : null}
          {data.wind !== undefined ? <span>💨 {data.wind} km/h</span> : null}
        </div>
      ) : null}
    </div>
  );
}
