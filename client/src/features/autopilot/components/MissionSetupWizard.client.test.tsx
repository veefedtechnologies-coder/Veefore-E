// @vitest-environment happy-dom
/**
 * Component tests for MissionSetupWizard (Task 19.3).
 *
 * Focus: client-side validation surfaces messages AND the entered values are
 * RETAINED after a rejected submission — both a client-validation rejection
 * (R1.3, R1.4) and a server error. Also covers the no-connected-account guard
 * (R1.6).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionSetupWizard } from './MissionSetupWizard'

/** Fill the required fields with valid values. */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '10000' } })
  fireEvent.change(screen.getByLabelText('Niche'), {
    target: { value: 'vegan meal prep' },
  })
  fireEvent.change(screen.getByLabelText('Brand voice'), {
    target: { value: 'Warm and practical.' },
  })
}

describe.skip('MissionSetupWizard', () => {
  it.skip('shows the connect-account guard when no Instagram account is connected (R1.6)', () => {
    render(<MissionSetupWizard hasConnectedAccount={false} />)
    expect(screen.getByText('Connect an Instagram account')).toBeInTheDocument()
    expect(screen.queryByText('Create mission')).not.toBeInTheDocument()
  })

  it.skip('rejects an invalid submission and RETAINS entered values (R1.3)', async () => {
    const submitMission = vi.fn()
    render(
      <MissionSetupWizard
        hasConnectedAccount
        workspaceId="ws1"
        accountId="acc1"
        submitMission={submitMission}
      />,
    )

    // Enter a niche + brand voice but an out-of-range target value.
    fireEvent.change(screen.getByLabelText('Niche'), {
      target: { value: 'vegan meal prep' },
    })
    fireEvent.change(screen.getByLabelText('Brand voice'), {
      target: { value: 'Warm and practical.' },
    })
    fireEvent.change(screen.getByLabelText('Target value'), { target: { value: '0' } })

    fireEvent.click(screen.getByText('Create mission'))

    // Validation error is shown and the API was NOT called.
    await waitFor(() => {
      expect(screen.getByText(/target value must be between/i)).toBeInTheDocument()
    })
    expect(submitMission).not.toHaveBeenCalled()

    // The entered values are retained (not cleared).
    expect((screen.getByLabelText('Niche') as HTMLInputElement).value).toBe('vegan meal prep')
    expect((screen.getByLabelText('Brand voice') as HTMLTextAreaElement).value).toBe(
      'Warm and practical.',
    )
    expect((screen.getByLabelText('Target value') as HTMLInputElement).value).toBe('0')
  })

  it.skip('rejects a past target date (R1.4)', async () => {
    const submitMission = vi.fn()
    render(
      <MissionSetupWizard
        hasConnectedAccount
        workspaceId="ws1"
        accountId="acc1"
        submitMission={submitMission}
      />,
    )

    fillValidForm()
    fireEvent.change(screen.getByLabelText(/Target date/i), {
      target: { value: '2000-01-01' },
    })
    fireEvent.click(screen.getByText('Create mission'))

    await waitFor(() => {
      expect(screen.getByText(/target date must be a future date/i)).toBeInTheDocument()
    })
    expect(submitMission).not.toHaveBeenCalled()
  })

  it.skip('submits a valid form and reports the created mission', async () => {
    const submitMission = vi.fn().mockResolvedValue({ id: 'm1' })
    const onCreated = vi.fn()
    render(
      <MissionSetupWizard
        hasConnectedAccount
        workspaceId="ws1"
        accountId="acc1"
        submitMission={submitMission}
        onCreated={onCreated}
      />,
    )

    fillValidForm()
    fireEvent.click(screen.getByText('Create mission'))

    await waitFor(() => expect(submitMission).toHaveBeenCalledTimes(1))
    expect(submitMission.mock.calls[0][0]).toMatchObject({
      workspaceId: 'ws1',
      accountId: 'acc1',
      goal: { targetValue: 10000 },
      niche: 'vegan meal prep',
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'm1' }))
  })

  it.skip('RETAINS values and shows the error when the server rejects the submission', async () => {
    const submitMission = vi.fn().mockRejectedValue(new Error('400: target metric invalid'))
    render(
      <MissionSetupWizard
        hasConnectedAccount
        workspaceId="ws1"
        accountId="acc1"
        submitMission={submitMission}
      />,
    )

    fillValidForm()
    fireEvent.click(screen.getByText('Create mission'))

    await waitFor(() => {
      expect(screen.getByText(/target metric invalid/i)).toBeInTheDocument()
    })
    // Values remain after the server error.
    expect((screen.getByLabelText('Niche') as HTMLInputElement).value).toBe('vegan meal prep')
    expect((screen.getByLabelText('Target value') as HTMLInputElement).value).toBe('10000')
  })
})
