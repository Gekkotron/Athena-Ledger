import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DonateMenu } from '../DonateMenu';
import { pinLocale } from '../../../test/i18n';

pinLocale('layout');

describe('DonateMenu', () => {
  it('is closed until the trigger is clicked', () => {
    render(<DonateMenu className="" />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists the three donation platforms with external links', async () => {
    render(<DonateMenu className="" />);
    await userEvent.click(screen.getByRole('button', { name: /Soutenir le projet/ }));

    const items = screen.getAllByRole('menuitem');
    expect(items.map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/sponsors/Gekkotron',
      'https://www.patreon.com/Gekkotron',
      'https://www.buymeacoffee.com/Gekkotron',
    ]);
    for (const a of items) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('closes on Escape', async () => {
    render(<DonateMenu className="" />);
    await userEvent.click(screen.getByRole('button', { name: /Soutenir le projet/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
