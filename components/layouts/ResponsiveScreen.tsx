import React from 'react';

type ResponsiveScreenProps = {
  header: React.ReactNode;
  main: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
  mainClassName?: string;
  asideClassName?: string;
  footerContainerClassName?: string;
};

const ResponsiveScreen: React.FC<ResponsiveScreenProps> = ({
  header,
  main,
  aside,
  footer,
  contentClassName = '',
  mainClassName = '',
  asideClassName = '',
  footerContainerClassName = '',
}) => {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background-light font-display">
      <div className="mx-auto flex min-h-screen w-full max-w-md md:max-w-5xl flex-col">
        {header}

        <main className={`flex-1 overflow-y-auto no-scrollbar ${contentClassName}`}>
          {aside ? (
            <div className="md:grid md:grid-cols-[minmax(0,1fr)_420px] md:gap-10 md:items-start">
              <div className={mainClassName}>{main}</div>
              <div className={asideClassName}>{aside}</div>
            </div>
          ) : (
            <div className={mainClassName}>{main}</div>
          )}
        </main>

        {footer ? (
          <div className="fixed bottom-0 left-0 right-0 z-[60] border-t border-gray-50 bg-white/90 p-5 pb-10 shadow-[0_-10px_40px_-15px_rgba(19,236,73,0.15)] backdrop-blur-xl">
            <div className={`mx-auto w-full max-w-md md:max-w-5xl ${footerContainerClassName}`}>
              {footer}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ResponsiveScreen;
