'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, RefreshCw, Truck } from 'lucide-react';

let googleMapsPromise;

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    script.async = true;
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else {
        googleMapsPromise = null;
        reject(new Error('O Google Maps não pôde ser inicializado.'));
      }
    };
    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error('Não foi possível carregar o mapa do Google.'));
    };
    document.head.append(script);
  });

  return googleMapsPromise;
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Horário indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function CustomerDeliveryTracking({ orderId }) {
  const [expanded, setExpanded] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);

  useEffect(() => {
    if (!expanded) return undefined;
    let active = true;

    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch(`/api/my/orders/${encodeURIComponent(orderId)}/tracking`, {
          cache: 'no-store',
          credentials: 'include',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o rastreamento.');
        if (active) {
          setTracking(data);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'Não foi possível atualizar o rastreamento.');
      } finally {
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    void refresh();
    const interval = window.setInterval(refresh, 10_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [expanded, orderId, refreshCount]);

  useEffect(() => {
    if (!tracking?.location || !tracking.googleMapsApiKey || !mapElement.current) return undefined;
    let active = true;

    loadGoogleMaps(tracking.googleMapsApiKey)
      .then((maps) => {
        if (!active || !mapElement.current) return;
        const position = { lat: tracking.location.latitude, lng: tracking.location.longitude };
        if (!mapInstance.current) {
          mapInstance.current = new maps.Map(mapElement.current, {
            center: position,
            zoom: 15,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            clickableIcons: false,
          });
          markerInstance.current = new maps.Marker({
            map: mapInstance.current,
            position,
            title: 'Localização atual do entregador',
            label: { text: 'Entregador', color: '#ffffff', fontWeight: '700' },
          });
        } else {
          markerInstance.current.setPosition(position);
          mapInstance.current.panTo(position);
        }
        setMapError('');
      })
      .catch((mapLoadError) => {
        if (active) setMapError(mapLoadError.message || 'O mapa está temporariamente indisponível.');
      });

    return () => {
      active = false;
    };
  }, [tracking]);

  return (
    <div className="customer-delivery-tracking">
      <button
        type="button"
        className="customer-delivery-tracking-toggle"
        aria-expanded={expanded}
        aria-controls={`delivery-tracking-${orderId}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <Truck size={15} aria-hidden="true" />
        {expanded ? 'Ocultar rastreamento' : 'Ver entregador ao vivo'}
      </button>
      {expanded && <section id={`delivery-tracking-${orderId}`} className="customer-delivery-tracking-panel" aria-live="polite">
        <div className="customer-delivery-tracking-heading">
          <strong>Localização do entregador</strong>
          <button type="button" aria-label="Atualizar localização agora" onClick={() => {
            setLoading(true);
            setError('');
            setRefreshCount((current) => current + 1);
          }}>
            <RefreshCw size={14} aria-hidden="true" />Atualizar
          </button>
        </div>
        {loading && !tracking && <p role="status">Buscando a localização do entregador...</p>}
        {error && <p className="customer-delivery-tracking-error" role="alert">{error}</p>}
        {tracking && !tracking.active && <p role="status">{tracking.message || 'O rastreamento ao vivo não está disponível.'}</p>}
        {tracking?.active && !tracking.started && <p role="status">O entregador ainda não iniciou o compartilhamento da localização.</p>}
        {tracking?.active && tracking.started && !tracking.location && <p role="status">Aguardando o primeiro sinal do GPS do entregador.</p>}
        {tracking?.location && <>
          <p className={tracking.location.stale ? 'customer-delivery-tracking-stale' : 'customer-delivery-tracking-fresh'} role="status">
            <MapPin size={14} aria-hidden="true" />
            {tracking.location.stale ? 'Última posição recebida' : 'Localização atualizada'} · {formatUpdatedAt(tracking.location.updatedAt)}
          </p>
          {tracking.googleMapsApiKey
            ? <div ref={mapElement} className="customer-delivery-tracking-map" role="application" aria-label="Mapa com a localização do entregador" />
            : <p className="customer-delivery-tracking-error" role="status">O mapa do Google ainda não foi configurado. A localização continua disponível pelo link abaixo.</p>}
          <a
            className="customer-delivery-tracking-map-link"
            href={`https://www.google.com/maps/search/?api=1&query=${tracking.location.latitude},${tracking.location.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir localização no Google Maps
          </a>
        </>}
        {tracking?.active && <small className="customer-delivery-tracking-note">A posição é compartilhada apenas durante esta entrega e atualiza automaticamente a cada 10 segundos.</small>}
        {mapError && <p className="customer-delivery-tracking-error" role="alert">{mapError} Confira se a chave está ativa e restrita ao domínio da loja.</p>}
      </section>}
    </div>
  );
}
