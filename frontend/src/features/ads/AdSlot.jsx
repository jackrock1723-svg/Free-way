import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { adDomain } from '../composer/composerModel.js';

// A small sponsored card shown only at natural pauses. It never blocks work: failures render nothing,
// it sits below the content, and it can always be closed.
export default function AdSlot({ placement, context = '', project, agentId, agentState, runKey, variant }) {
  const [ad, setAd] = useState(null);
  const [why, setWhy] = useState(false);
  const [closed, setClosed] = useState(false);
  const viewed = useRef('');
  const key = `${placement}|${agentId || ''}|${agentState || ''}|${runKey || ''}`;

  useEffect(() => {
    let live = true;
    setAd(null); setWhy(false); setClosed(false);
    const body = { placement, project };
    if (agentId) body.agent = agentId; else { body.context = String(context).slice(0, 2000); if (runKey) body.run = runKey; }
    api.request('/api/ads/next', { method: 'POST', body })
      .then((result) => { if (live && result?.ad?.id) setAd(result.ad); })
      .catch(() => { /* ads are optional: never show an error for them */ });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ad || viewed.current === ad.id) return;
    viewed.current = ad.id;
    api.request('/api/ads/event', { method: 'POST', body: { id: ad.id, sig: ad.sig, kind: 'view' } }).catch(() => {});
  }, [ad]);

  if (!ad || closed) return null;

  const close = () => {
    setClosed(true);
    api.request('/api/ads/event', { method: 'POST', body: { id: ad.id, sig: ad.sig, kind: 'close' } }).catch(() => {});
  };
  const click = () => {
    api.request('/api/ads/event', { method: 'POST', body: { id: ad.id, sig: ad.sig, kind: 'click' } }).catch(() => {});
  };

  if (variant === 'strip') {
    const domain = adDomain(ad.url);
    return (
      <aside className="ad-strip" aria-label="Sponsored">
        <span className="ad-strip-icon" aria-hidden="true">{(ad.advertiser || ad.title || 'A').slice(0, 1).toUpperCase()}</span>
        <div className="ad-strip-body">
          <a className="ad-strip-title" href={ad.url} target="_blank" rel="noopener noreferrer sponsored" onClick={click}>{ad.title}</a>
          <p className="ad-strip-line"><span className="ad-strip-label">Ad</span>{domain ? ` · ${domain}` : ''}{ad.text ? ` · ${ad.text}` : ''}</p>
        </div>
        <button type="button" className="ad-close" aria-label="Close ad" onClick={close}>×</button>
      </aside>
    );
  }

  return (
    <aside className="ad-card" aria-label="Sponsored">
      <div className="ad-card-head">
        <span className="ad-label">{ad.label || 'Sponsored'}{ad.advertiser ? ` · ${ad.advertiser}` : ''}</span>
        <div className="ad-card-tools">
          <button type="button" className="text-button" aria-expanded={why} onClick={() => setWhy((v) => !v)}>Why this ad?</button>
          <button type="button" className="ad-close" aria-label="Close ad" onClick={close}>×</button>
        </div>
      </div>
      <a className="ad-title" href={ad.url} target="_blank" rel="noopener noreferrer sponsored" onClick={click}>{ad.title}</a>
      {ad.text ? <p className="ad-text">{ad.text}</p> : null}
      {why ? <p className="ad-why" role="note">{ad.why} You can change this in Settings → Ads &amp; privacy.</p> : null}
    </aside>
  );
}
