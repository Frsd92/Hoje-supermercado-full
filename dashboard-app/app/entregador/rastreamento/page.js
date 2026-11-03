'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Radio, Square } from 'lucide-react';

export default function DriverTrackingPage() {
  const [token, setToken] = useState('');
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const watchId = useRef(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    const secret = window.location.hash.slice(1);
    window.history.replaceState(null, '', window.location.pathname);
    setToken(secret);
    if (!secret) setError('Abra o link de rastreamento enviado pela loja para iniciar a entrega.');
  }, []);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
  }, []);

  const send = async (action, location) => {
    const response = await fetch('/api/driver-tracking/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ token, action, ...(location ? { location } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o rastreamento.');
    return data;
  };

  const stopSharing = async () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
    try {
      const data = await send('stop');
      setStatus(data.message);
    } catch (stopError) {
      setError(stopError.message || 'Não foi possível encerrar o compartilhamento.');
    }
  };

  const startSharing = async () => {
    if (!token || !('geolocation' in navigator)) {
      setError('Este aparelho ou navegador não oferece acesso à localização.');
      return;
    }

    setError('');
    setStatus('Solicitando permissão de localização...');
    try {
      const data = await send('start');
      setStatus(data.message);
      setSharing(true);
      watchId.current = navigator.geolocation.watchPosition(async (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < 5000) return;
        lastSentAt.current = now;
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        };
        try {
          await send('location', location);
          setLastUpdatedAt(new Date().toLocaleTimeString('pt-BR'));
          setAccuracy(location.accuracy);
          setError('');
        } catch (locationError) {
          setError(locationError.message || 'Não foi possível enviar a localização.');
        }
      }, (geolocationError) => {
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setError(geolocationError.code === geolocationError.PERMISSION_DENIED
          ? 'Permita o acesso à localização nas configurações do navegador e tente novamente.'
          : 'Não foi possível obter o GPS. Verifique o sinal e tente novamente.');
        setSharing(false);
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    } catch (startError) {
      setStatus('');
      setError(startError.message || 'Não foi possível iniciar o rastreamento.');
    }
  };

  return (
    <main className="driver-tracking-page">
      <section className="driver-tracking-card">
        <div className="driver-tracking-icon"><MapPin size={24} aria-hidden="true" /></div>
        <span className="orders-kicker">Hoje Supermercado</span>
        <h1>Rastreamento da entrega</h1>
        <p>Compartilhe sua localização enquanto estiver levando o pedido ao cliente. O GPS só será enviado enquanto o compartilhamento estiver ativo.</p>
        {!token && <p className="driver-tracking-error" role="alert">{error}</p>}
        {token && <>
          <p className="driver-tracking-privacy" role="note">Ao iniciar, você autoriza o compartilhamento da localização desta entrega com o cliente até encerrar o rastreamento ou o link expirar.</p>
          {status && <p role="status">{status}</p>}
          {error && <p className="driver-tracking-error" role="alert">{error}</p>}
          {lastUpdatedAt && <p className="driver-tracking-location" role="status"><Radio size={15} aria-hidden="true" />Último envio: {lastUpdatedAt}{Number.isFinite(accuracy) ? ` · precisão aproximada de ${Math.round(accuracy)} m` : ''}</p>}
          {!sharing
            ? <button type="button" className="primary-cta" onClick={() => void startSharing()}><MapPin size={17} aria-hidden="true" />Iniciar compartilhamento</button>
            : <button type="button" className="driver-tracking-stop" onClick={() => void stopSharing()}><Square size={16} aria-hidden="true" />Encerrar compartilhamento</button>}
        </>}
      </section>
    </main>
  );
}
