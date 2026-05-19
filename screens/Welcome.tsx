import React from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';

const HERO_IMAGE = `url("https://lh3.googleusercontent.com/aida-public/AB6AXuBF4TcVNpgk0NHcBlydxxHPcmn4nvygdoGMe7WQkcaS22P9vR0ADcvgw4iRKNwrisBqqI8Ni-HZXP8QU3BYu_M9rZQNOvhT5AcSfYttQsnMQTaKOtct1oRSSSB2kWJqaQNkCT2DAtKFybo-W0Rx8avEA8yegFQntGlhIW_RR-ntl9swbEriy_PEIDcV233v-ZY1KbLCluFhoL_FZZCbNSeTd7ZLva_W7JU8gL7d9-gkImbcdpl3LbqM61iCjo6q65EGk3chFypZLRI")`;

const Welcome: React.FC = () => {
  const navigate = useNavigate();

  return (
    // Mobile: vertical stack, scrollable. Desktop: two-column, full-screen.
    <div className="relative flex min-h-screen w-full flex-col bg-[#f7f8f6] md:flex-row md:h-screen md:overflow-hidden">

      {/* ── Mobile hero (hidden on desktop) ── */}
      <div className="relative h-[55vw] min-h-[240px] w-full flex-shrink-0 md:hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: HERO_IMAGE }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-[#f7f8f6] opacity-60" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f7f8f6] to-transparent" />
      </div>

      {/* ── Desktop hero — left column (hidden on mobile) ── */}
      <div className="hidden md:block relative w-[55%] flex-shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: HERO_IMAGE }}
        />
        {/* Subtle right-edge fade into the content panel */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#f7f8f6]/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-transparent" />
      </div>

      {/* ── Content sheet ── */}
      {/*
        Mobile: overlaps hero with -mt-10 + rounded top corners (as designed).
        Desktop: right column, vertically centered, plain white bg.
      */}
      <div className="
        relative z-10 flex flex-1 flex-col items-center px-6 pb-8
        -mt-10 bg-[#f7f8f6] rounded-t-[2.5rem]
        md:mt-0 md:rounded-none md:justify-center md:bg-white md:shadow-[-24px_0_48px_-12px_rgba(0,0,0,0.08)]
        md:w-[45%] md:flex-shrink-0
      ">
        {/* Logo */}
        <div className="
          -mt-10 mb-6 flex items-center justify-center
          rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)]
          ring-4 ring-[#f7f8f6] px-5 py-3
          md:mt-0 md:mb-8 md:ring-white
        ">
          <Logo variant="primary" className="h-10 w-auto" />
        </div>

        {/* Title & tagline */}
        <div className="flex flex-col items-center text-center space-y-3 max-w-xs mx-auto mb-auto md:mb-10">
          <h1 className="text-[#131b0d] text-3xl font-extrabold tracking-tight leading-tight font-display">
            TuBarrio
          </h1>
          <p className="text-gray-600 text-lg font-medium leading-relaxed">
            Tu comunidad, digitalizada y segura.
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full max-w-md flex flex-col gap-4 mb-8">
          <button
            onClick={() => navigate('/register')}
            className="flex w-full cursor-pointer items-center justify-center rounded-full h-14 px-6 font-bold text-base tracking-wide text-[#131b0d] transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#6dec13', boxShadow: '0 8px 24px rgba(109,236,19,0.35)' }}
          >
            Crear mi cuenta
          </button>

          <button
            onClick={() => navigate('/login')}
            className="flex w-full cursor-pointer items-center justify-center rounded-full h-14 px-6 font-bold text-base tracking-wide text-[#131b0d] bg-transparent border-2 border-[#131b0d]/10 hover:bg-[#131b0d]/5 transition-all active:scale-[0.98]"
          >
            Ya tengo cuenta, iniciar sesión
          </button>
        </div>

        {/* Footer pillars */}
        <div className="flex items-center justify-center gap-4 text-xs font-semibold uppercase tracking-wider text-[#6c9a4c]">
          <div className="flex items-center gap-1.5">
            <span
              className="text-base"
              style={{ fontFamily: 'Material Symbols Outlined', fontVariationSettings: '"FILL" 1' }}
            >
              shield
            </span>
            <span>Seguridad</span>
          </div>
          <span className="h-1 w-1 rounded-full bg-current opacity-40" />
          <div className="flex items-center gap-1.5">
            <span
              className="text-base"
              style={{ fontFamily: 'Material Symbols Outlined', fontVariationSettings: '"FILL" 1' }}
            >
              handshake
            </span>
            <span>Servicios</span>
          </div>
          <span className="h-1 w-1 rounded-full bg-current opacity-40" />
          <div className="flex items-center gap-1.5">
            <span
              className="text-base"
              style={{ fontFamily: 'Material Symbols Outlined', fontVariationSettings: '"FILL" 1' }}
            >
              trophy
            </span>
            <span>Torneos</span>
          </div>
        </div>

        <div className="h-4 w-full" />
      </div>
    </div>
  );
};

export default Welcome;
