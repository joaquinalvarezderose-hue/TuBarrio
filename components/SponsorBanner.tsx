import React, { useState, useEffect, useRef } from 'react';

interface Sponsor {
  src: string;
  alt: string;
  href?: string;
}

const sponsors: Sponsor[] = [
  { src: '/images/sponsors/sponsor-1.jpg', alt: 'Sponsor 1' },
  { src: '/images/sponsors/sponsor-2.jpg', alt: 'Sponsor 2' },
  { src: '/images/sponsors/sponsor-3.jpg', alt: 'Sponsor 3' },
];

const SponsorBanner: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = () => {
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % sponsors.length);
    }, 3000);
  };

  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const goTo = (index: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCurrent(index);
    startInterval();
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
        Nuestros Sponsors
      </span>
      <div className="relative overflow-hidden rounded-2xl shadow-sm border border-gray-100 bg-white h-24">
        <div
          className="flex h-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {sponsors.map((sponsor, i) => {
            const content = (
              <div
                key={i}
                className="min-w-full h-full"
              >
                <img
                  src={sponsor.src}
                  alt={sponsor.alt}
                  className="w-full h-full object-cover"
                />
              </div>
            );
            return sponsor.href ? (
              <a
                key={i}
                href={sponsor.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-full h-full block"
              >
                <img
                  src={sponsor.src}
                  alt={sponsor.alt}
                  className="w-full h-full object-cover"
                />
              </a>
            ) : content;
          })}
        </div>
      </div>
      <div className="flex justify-center gap-1.5">
        {sponsors.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === current ? 'w-4 bg-primary' : 'w-1.5 bg-gray-300'
            }`}
            aria-label={`Sponsor ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default SponsorBanner;
