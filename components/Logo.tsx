import React from 'react';

export type LogoVariant = 'primary' | 'tournament' | 'accent' | 'symbol';

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  alt?: string;
}

const LOGO_MAP: Record<LogoVariant, string> = {
  primary: '/logos/logo-primary.png',
  tournament: '/logos/logo-tournament.png',
  accent: '/logos/logo-accent.png',
  symbol: '/logos/logo-symbol.png',
};

const Logo: React.FC<LogoProps> = ({ variant = 'primary', className = '', alt = 'TuBarrio' }) => {
  return (
    <img
      src={LOGO_MAP[variant]}
      alt={alt}
      className={className}
      draggable={false}
    />
  );
};

export default Logo;
