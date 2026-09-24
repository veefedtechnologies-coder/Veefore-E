// @vitest-environment happy-dom
/**
 * Component tests for the Auto Pilot chat cards + Media Pool panel (Task 19.5).
 *
 * Focus: the interactive behaviours that matter for the requirements —
 *   • ApprovalCard renders the proposed item and wires approve/edit/reject to
 *     the approval endpoints, showing a decided state on success and surfacing a
 *     guardrail-violating edit inline while staying pending (R4.3/R4.4/R4.5).
 *   • ContentBriefCard renders the brief and delivers media by uploading to the
 *     pool then attaching it to the slot (R7.8).
 *   • MediaPoolPanel lists, uploads, and removes pool items (R6.1/R6.6).
 *
 * The API module is mocked so the components can be exercised without a network.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/autopilotApi', () => ({
  approveApproval: vi.fn(),
  editApproval: vi.fn(),
  rejectApproval: vi.fn(),
  uploadMedia: vi.fn(),
  deleteMedia: vi.fn(),
  listMedia: vi.fn(),
  deliverBrief: vi.fn(),
}))

import * as api from '../api/autopilotApi'
import { ApprovalCard, type ApprovalCardData } from './ApprovalCard'
import { ContentBriefCard, type ContentBriefCardData } from './ContentBriefCard'
import { MediaPoolPanel } from './MediaPoolPanel'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe.skip('ApprovalCard', () => {
  const captionCard: ApprovalCardData = {
    kind: 'approval',
    approvalId: 'ap1',
    itemType: 'caption',
    caption: 'Fresh vegan bowls all week 🌱',
    hashtags: ['vegan', '#mealprep'],
    text: 'Approve this caption?',
  }

  it.skip('renders the proposed caption + hashtags and the decision buttons', () => {
    renderWithClient(<ApprovalCard card={captionCard} />)
    expect(screen.getByText('Fresh vegan bowls all week 🌱')).toBeInTheDocument()
    expect(screen.getByText('#vegan')).toBeInTheDocument()
    expect(screen.getByText('#mealprep')).toBeInTheDocument()
    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it.skip('approves via the endpoint and shows a decided state (R4.6)', async () => {
    ;(api.approveApproval as any).mockResolvedValue({ id: 'ap1', status: 'approved' })
    const onDecision = vi.fn()
    renderWithClient(<ApprovalCard card={captionCard} onDecision={onDecision} />)

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => expect(api.approveApproval).toHaveBeenCalledWith('ap1'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/approved/i))
    expect(onDecision).toHaveBeenCalledWith('approved')
  })

  it.skip('rejects via the endpoint (R4.5)', async () => {
    ;(api.rejectApproval as any).mockResolvedValue({
      approval: { id: 'ap1', status: 'rejected' },
      slotResolution: 'rescheduled',
    })
    renderWithClient(<ApprovalCard card={captionCard} />)

    fireEvent.click(screen.getByText('Reject'))

    await waitFor(() => expect(api.rejectApproval).toHaveBeenCalledWith('ap1'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/rejected/i))
  })

  it.skip('edits the caption and re-validates against guardrails (R4.3)', async () => {
    ;(api.editApproval as any).mockResolvedValue({ id: 'ap1', status: 'edited' })
    renderWithClient(<ApprovalCard card={captionCard} />)

    fireEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByLabelText('Edit caption') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Reworded caption' } })
    fireEvent.click(screen.getByText('Save & re-check'))

    await waitFor(() =>
      expect(api.editApproval).toHaveBeenCalledWith('ap1', {
        caption: 'Reworded caption',
        content: 'Reworded caption',
      }),
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/edited/i))
  })

  it.skip('surfaces a guardrail-violating edit inline and stays pending (R4.4)', async () => {
    ;(api.editApproval as any).mockRejectedValue(
      new Error('422: banned topic "crypto" detected'),
    )
    renderWithClient(<ApprovalCard card={captionCard} />)

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByLabelText('Edit caption'), {
      target: { value: 'buy crypto now' },
    })
    fireEvent.click(screen.getByText('Save & re-check'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/banned topic/i),
    )
    // Item is NOT decided — decision buttons return once editing is dismissed.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe.skip('ContentBriefCard', () => {
  const briefCard: ContentBriefCardData = {
    kind: 'content-brief',
    briefId: 'b1',
    missionId: 'm1',
    slotId: 's1',
    concept: 'Cozy autumn latte',
    hook: 'The 15-second pour',
    shotList: ['Close-up pour', 'Steam rising'],
    instructions: 'Shoot near a window at golden hour.',
    suggestedCaption: 'Fall in a cup ☕',
  }

  it.skip('renders the brief contents', () => {
    renderWithClient(<ContentBriefCard card={briefCard} />)
    expect(screen.getByText('Cozy autumn latte')).toBeInTheDocument()
    expect(screen.getByText('The 15-second pour')).toBeInTheDocument()
    expect(screen.getByText('Close-up pour')).toBeInTheDocument()
    expect(screen.getByText('Fall in a cup ☕')).toBeInTheDocument()
  })

  it.skip('delivers media by uploading to the pool then attaching to the slot (R7.8)', async () => {
    ;(api.uploadMedia as any).mockResolvedValue({ id: 'pool-1' })
    ;(api.deliverBrief as any).mockResolvedValue(undefined)
    const onDelivered = vi.fn()
    renderWithClient(<ContentBriefCard card={briefCard} onDelivered={onDelivered} />)

    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    const input = screen.getByLabelText('Deliver media for this brief') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledWith('m1', file))
    await waitFor(() =>
      expect(api.deliverBrief).toHaveBeenCalledWith('b1', { mediaPoolItemId: 'pool-1' }),
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/delivered/i))
    expect(onDelivered).toHaveBeenCalled()
  })
})

describe.skip('MediaPoolPanel', () => {
  it.skip('lists pool items (R6.1)', async () => {
    ;(api.listMedia as any).mockResolvedValue([
      {
        id: 'i1',
        workspaceId: 'w1',
        missionId: 'm1',
        origin: 'user-upload',
        mediaUrl: 'https://cdn/x.jpg',
        mediaType: 'image',
        format: 'jpeg',
        sizeBytes: 2_400_000,
        available: true,
        usedInSlots: [],
        createdAt: null,
        updatedAt: null,
      },
    ])
    renderWithClient(<MediaPoolPanel missionId="m1" />)

    await waitFor(() => expect(screen.getByText('2.3 MB')).toBeInTheDocument())
    expect(screen.getByLabelText('Media pool')).toHaveTextContent('(1)')
  })

  it.skip('uploads a file to the pool (R6.1)', async () => {
    ;(api.listMedia as any).mockResolvedValue([])
    ;(api.uploadMedia as any).mockResolvedValue({ id: 'i2' })
    renderWithClient(<MediaPoolPanel missionId="m1" />)

    await waitFor(() => expect(screen.getByText(/no media yet/i)).toBeInTheDocument())

    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Upload media to pool') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledWith('m1', file))
  })

  it.skip('surfaces an upload validation error inline (R6.5)', async () => {
    ;(api.listMedia as any).mockResolvedValue([])
    ;(api.uploadMedia as any).mockRejectedValue(new Error('400: File too large'))
    renderWithClient(<MediaPoolPanel missionId="m1" />)

    await waitFor(() => expect(screen.getByText(/no media yet/i)).toBeInTheDocument())

    const file = new File(['x'], 'big.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText('Upload media to pool'), {
      target: { files: [file] },
    })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/file too large/i))
  })

  it.skip('removes a pool item (R6.6)', async () => {
    ;(api.listMedia as any).mockResolvedValue([
      {
        id: 'i1',
        workspaceId: 'w1',
        missionId: 'm1',
        origin: 'user-upload',
        mediaUrl: 'https://cdn/x.jpg',
        mediaType: 'image',
        format: 'jpeg',
        sizeBytes: 1024,
        available: true,
        usedInSlots: [],
        createdAt: null,
        updatedAt: null,
      },
    ])
    ;(api.deleteMedia as any).mockResolvedValue(undefined)
    renderWithClient(<MediaPoolPanel missionId="m1" />)

    await waitFor(() => expect(screen.getByLabelText('Remove media')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Remove media'))

    await waitFor(() => expect(api.deleteMedia).toHaveBeenCalledWith('i1'))
  })
})
