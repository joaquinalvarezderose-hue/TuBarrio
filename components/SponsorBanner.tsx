import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

interface Sponsor {
  id: string;
  name: string;
  src: string;
  alt: string;
  href?: string;
}

const sponsors: Sponsor[] = [
  {
    id: 'sponsor-1',
    name: 'Sponsor 1',
    src: '/images/sponsors/sponsor-1.png',
    alt: 'Sponsor 1',
    href: 'https://api.whatsapp.com/send?phone=5491122945685&text=Quisiera%20contactarme%20con%20ustedes%20los%20vi%20en%20TuBarrio',
  },
  {
    id: 'sponsor-2',
    name: 'Sponsor 2',
    src: '/images/sponsors/sponsor-2.png',
    alt: 'Sponsor 2',
    href: 'https://docs.google.com/forms/d/1NhO9Ufc6kVmybhqV1g2I_fD7-VN8xFZHiIutzjOVfZM/viewform',
  },
];

const SWIPE_THRESHOLD = 50;
const DRAG_THRESHOLD = 10;

const SponsorBanner: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const validSponsors = sponsors.filter((s) => !failedImages.has(s.id));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartX = useRef<number | null>(null);
  const dragDelta = useRef<number>(0);
  const isDragging = useRef(false);

  const startInterval = () => {
    if (validSponsors.length <= 1) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % validSponsors.length);
    }, 4000);
  };

  useEffect(() => {
    startInterval();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [validSponsors.length]);

  useEffect(() => {
    if (current >= validSponsors.length && validSponsors.length > 0) setCurrent(0);
  }, [validSponsors.length]);

  const goTo = (index: number) => {
    setCurrent(index);
    startInterval();
  };

  const handleDragStart = (x: number) => {
    dragStartX.current = x;
    dragDelta.current = 0;
    isDragging.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleDragMove = (x: number) => {
    if (dragStartX.current === null) return;
    dragDelta.current = x - dragStartX.current;
    if (Math.abs(dragDelta.current) > DRAG_THRESHOLD) isDragging.current = true;
  };

  const handleDragEnd = () => {
    if (dragStartX.current === null) return;
    const delta = dragDelta.current;
    dragStartX.current = null;
    if (Math.abs(delta) >= SWIPE_THRESHOLD) {
      goTo(delta < 0
        ? (current + 1) % validSponsors.length
        : (current - 1 + validSponsors.length) % validSponsors.length
      );
    } else {
      startInterval();
    }
  };

  const logClick = async (sponsor: Sponsor) => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;
    let userNombre: string | null = null;
    if (userId) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre_completo')
        .eq('id', userId)
        .single();
      userNombre = perfil?.nombre_completo ?? null;
    }
    await supabase.from('sponsor_clicks').insert({
      sponsor_id: sponsor.id,
      sponsor_name: sponsor.name,
      user_id: userId,
      user_nombre: userNombre,
    });
  };

  if (validSponsors.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">
        Nuestros Sponsors
      </span>
      <div
        className="relative overflow-hidden rounded-2xl shadow-sm border border-gray-100 bg-black h-24 md:h-40 group select-none"
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {validSponsors.map((sponsor) =>
            sponsor.href ? (
              <a
                key={sponsor.id}
                href={sponsor.href}
                className="min-w-full h-full block cursor-pointer"
                onClick={(e) => { e.preventDefault(); if (!isDragging.current) { logClick(sponsor); window.open(sponsor.href, '_blank', 'noopener,noreferrer'); } }}
                draggable={false}
              >
                <img
                  src={sponsor.src}
                  alt={sponsor.alt}
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={() => setFailedImages((prev) => new Set([...prev, sponsor.id]))}
                />
              </a>
            ) : (
              <div key={sponsor.id} className="min-w-full h-full">
                <img
                  src={sponsor.src}
                  alt={sponsor.alt}
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={() => setFailedImages((prev) => new Set([...prev, sponsor.id]))}
                />
              </div>
            )
          )}
        </div>

        {validSponsors.length > 1 && (
          <>
            <button
              onClick={() => goTo((current - 1 + validSponsors.length) % validSponsors.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-lg leading-none"
              aria-label="Anterior"
            >‹</button>
            <button
              onClick={() => goTo((current + 1) % validSponsors.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-lg leading-none"
              aria-label="Siguiente"
            >›</button>
          </>
        )}
      </div>

      {validSponsors.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {validSponsors.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? 'w-4 bg-primary' : 'w-1.5 bg-gray-300'}`}
              aria-label={`Sponsor ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SponsorBanner;
