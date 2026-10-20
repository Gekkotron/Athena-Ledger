import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFloating, autoUpdate, offset, flip, shift,
  useClick, useDismiss, useRole, useInteractions, FloatingPortal,
} from '@floating-ui/react';

// Same handles as .github/FUNDING.yml and the README's sponsor section.
const DONATE_OPTIONS = [
  { key: 'github', href: 'https://github.com/sponsors/Gekkotron' },
  { key: 'patreon', href: 'https://www.patreon.com/Gekkotron' },
  { key: 'coffee', href: 'https://www.buymeacoffee.com/Gekkotron' },
] as const;

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 14s-5.5-3.3-5.5-7.2A3 3 0 018 5a3 3 0 015.5 1.8C13.5 10.7 8 14 8 14z" />
    </svg>
  );
}

export function DonateMenu({ className }: { className: string }) {
  const { t } = useTranslation('layout');
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    // Lives in the footer, so open upward and fall back to below if clipped.
    placement: 'top-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        className={`${className} group`}
        {...getReferenceProps()}
      >
        <span className="text-clay-400/80 transition group-hover:text-clay-300">
          <HeartIcon />
        </span>
        {t('footer.donateLink')}
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 w-60 max-w-[90vw] rounded-lg border border-ink-700 bg-ink-900 shadow-lg ring-1 ring-ink-950/50 overflow-hidden"
          >
            <div className="px-4 pt-3 pb-2 border-b border-ink-800">
              <div className="text-sm font-medium text-ink-100">{t('footer.donate.title')}</div>
              <div className="text-xs text-ink-500">{t('footer.donate.subtitle')}</div>
            </div>
            <div className="flex flex-col py-1">
              {DONATE_OPTIONS.map((o) => (
                <a
                  key={o.key}
                  role="menuitem"
                  href={o.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-ink-200 hover:bg-ink-850 hover:text-ink-50 transition"
                >
                  {t(`footer.donate.${o.key}`)}
                </a>
              ))}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
