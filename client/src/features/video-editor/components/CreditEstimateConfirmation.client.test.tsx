// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { CreditEstimateConfirmation } from './CreditEstimateConfirmation';
import {
  parseCreditEstimateEvent,
  initialCreditEstimateState,
  CONFIRMATION_TIMEOUT_MS,
  type CreditEstimateState,
  type CreditEstimateEventPayload,
} from '../utils/creditEstimate';

/** Build a presented-estimate state from a raw payload for the component. */
function makeState(
  payload: Partial<CreditEstimateEventPayload>,
  presentedAtMs: number | null,
): CreditEstimateState {
  const parsed = parseCreditEstimateEvent({
    estimatedCredits: 12,
    reservationCredits: 15,
    outputSeconds: 5,
    balanceCredits: 100,
    affordable: true,
    ...payload,
  })!;
  return initialCreditEstimateState(parsed.estimate, parsed.affordability, presentedAtMs);
}

afterEach(() => cleanup());

describe.skip('CreditEstimateConfirmation', () => {
  it.skip('presents the server-computed estimate and requires confirmation (Req 17.7)', () => {
    const onConfirm = vi.fn();
    const onDecline = vi.fn();
    render(
      <CreditEstimateConfirmation
        estimate={makeState({}, Date.now())}
        onConfirm={onConfirm}
        onDecline={onDecline}
        onExpire={vi.fn()}
      />,
    );

    expect(screen.getByTestId('video-editor-estimate-confirm')).toBeTruthy();
    expect(screen.getByTestId('video-editor-estimate-credits').textContent).toContain('12 credits');

    fireEvent.click(screen.getByTestId('video-editor-estimate-confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
  });

  it.skip('cancelling declines the estimate (Req 17.8)', () => {
    const onDecline = vi.fn();
    render(
      <CreditEstimateConfirmation
        estimate={makeState({}, Date.now())}
        onConfirm={vi.fn()}
        onDecline={onDecline}
        onExpire={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('video-editor-estimate-cancel-button'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it.skip('disables confirm when credit-consuming actions are not permitted (Req 1.5)', () => {
    render(
      <CreditEstimateConfirmation
        estimate={makeState({}, Date.now())}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onExpire={vi.fn()}
        canConsumeCredits={false}
      />,
    );
    const confirmBtn = screen.getByTestId('video-editor-estimate-confirm-button') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it.skip('renders the upgrade/add-credit path when blocked and shows no confirm (Req 17.9)', () => {
    render(
      <CreditEstimateConfirmation
        estimate={makeState(
          {
            affordable: false,
            reason: 'Insufficient credits',
            balanceCredits: 3,
            upgradePath: {
              type: 'upgrade_or_add_credits',
              message: 'Add credits to run this edit',
              actions: ['upgrade_plan', 'add_credits'],
            },
          },
          Date.now(),
        )}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onExpire={vi.fn()}
      />,
    );
    expect(screen.getByTestId('video-editor-estimate-blocked')).toBeTruthy();
    expect(screen.getByTestId('video-editor-estimate-action-upgrade_plan')).toBeTruthy();
    expect(screen.getByTestId('video-editor-estimate-action-add_credits')).toBeTruthy();
    expect(screen.queryByTestId('video-editor-estimate-confirm-button')).toBeNull();
  });

  it.skip('auto-cancels when the 300 s window has already elapsed (Req 17.8)', () => {
    const onExpire = vi.fn();
    render(
      <CreditEstimateConfirmation
        estimate={makeState({}, Date.now() - (CONFIRMATION_TIMEOUT_MS + 5000))}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onExpire={onExpire}
      />,
    );
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it.skip('renders resolved outcomes for confirmed / declined / expired statuses', () => {
    const base = makeState({}, Date.now());

    const { rerender } = render(
      <CreditEstimateConfirmation
        estimate={{ ...base, status: 'confirmed' }}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onExpire={vi.fn()}
      />,
    );
    expect(screen.getByTestId('video-editor-estimate-confirmed')).toBeTruthy();

    rerender(
      <CreditEstimateConfirmation
        estimate={{ ...base, status: 'declined' }}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onExpire={vi.fn()}
      />,
    );
    expect(screen.getByTestId('video-editor-estimate-declined')).toBeTruthy();

    rerender(
      <CreditEstimateConfirmation
        estimate={{ ...base, status: 'expired' }}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onExpire={vi.fn()}
      />,
    );
    expect(screen.getByTestId('video-editor-estimate-expired')).toBeTruthy();
  });
});
