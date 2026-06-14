/**
 * VideoScriptEditor Component Tests
 * 
 * Test suite for VideoScriptEditor component covering:
 * - Rendering and UI elements
 * - Auto-save functionality with debouncing
 * - Undo/redo operations
 * - Scene editing
 * - Read-only mode
 * - Character and duration tracking
 * 
 * @module VideoScriptEditor.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoScriptEditor } from './VideoScriptEditor';
import { GeneratedScript, ScriptScene } from '../types';

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className} data-testid="card">{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className} data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children, className }: any) => <div className={className} data-testid="card-title">{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, title }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      title={title}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} data-testid="textarea" />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-variant={variant} className={className} data-testid="badge">
      {children}
    </span>
  ),
}));

describe('VideoScriptEditor', () => {
  let mockScript: GeneratedScript;
  let mockOnScriptUpdate: ReturnType<typeof vi.fn>;
  let mockOnSceneUpdate: ReturnType<typeof vi.fn>;
  let mockOnAutoSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    
    // Create mock script data
    mockScript = {
      title: 'Test Video Script',
      totalDuration: 60,
      hook: 'Test hook',
      callToAction: 'Test CTA',
      scenes: [
        {
          id: 'scene-1',
          duration: 20,
          description: 'Opening scene with introduction',
          visualElements: 'Camera pan, professional lighting',
          narration: 'Welcome to our video',
        },
        {
          id: 'scene-2',
          duration: 25,
          description: 'Main content demonstration',
          visualElements: 'Close-up shots, dynamic angles',
          narration: 'Here we show the key features',
        },
        {
          id: 'scene-3',
          duration: 15,
          description: 'Closing scene with call to action',
          visualElements: 'Wide shot, fade to black',
          narration: 'Thank you for watching',
        },
      ],
    };

    mockOnScriptUpdate = vi.fn();
    mockOnSceneUpdate = vi.fn();
    mockOnAutoSave = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the script editor with all sections', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      // Check for main title
      expect(screen.getByText('Script Editor')).toBeInTheDocument();
      expect(screen.getByText('Edit your video script and scenes')).toBeInTheDocument();

      // Check for overview stats
      expect(screen.getByText('3')).toBeInTheDocument(); // Scenes count
      expect(screen.getByText('60s')).toBeInTheDocument(); // Duration
      expect(screen.getByText('Scenes')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });

    it('should render all scenes', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      mockScript.scenes.forEach((scene, index) => {
        expect(screen.getByText(`Scene ${index + 1}`)).toBeInTheDocument();
      });
    });

    it('should display script title input', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      expect(titleInput).toBeInTheDocument();
      expect(titleInput).toHaveAttribute('type', 'text');
    });

    it('should show undo/redo buttons', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const buttons = screen.getAllByTestId('button');
      const undoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Undo'));
      const redoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Redo'));

      expect(undoButton).toBeInTheDocument();
      expect(redoButton).toBeInTheDocument();
    });
  });

  describe('Script Editing', () => {
    it('should update script title', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Video Title');

      expect(titleInput).toHaveValue('Updated Video Title');
    });

    it('should update scene description', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          onSceneUpdate={mockOnSceneUpdate}
        />
      );

      const textareas = screen.getAllByTestId('textarea');
      const descriptionTextarea = textareas[0]; // First scene description

      await user.clear(descriptionTextarea);
      await user.type(descriptionTextarea, 'Updated scene description');

      expect(descriptionTextarea).toHaveValue('Updated scene description');
    });

    it('should update scene narration', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const textareas = screen.getAllByTestId('textarea');
      // Find narration textarea (should be in italic style)
      const narrationTextarea = textareas.find(ta => 
        ta.className.includes('italic')
      );

      expect(narrationTextarea).toBeInTheDocument();
      
      if (narrationTextarea) {
        await user.clear(narrationTextarea);
        await user.type(narrationTextarea, 'Updated narration');
        expect(narrationTextarea).toHaveValue('Updated narration');
      }
    });

    it('should update scene duration', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const durationInputs = screen.getAllByDisplayValue(/\d+/);
      const firstDurationInput = durationInputs.find(input => 
        input.getAttribute('type') === 'number'
      );

      expect(firstDurationInput).toBeInTheDocument();
      
      if (firstDurationInput) {
        await user.clear(firstDurationInput);
        await user.type(firstDurationInput, '30');
        expect(firstDurationInput).toHaveValue(30);
      }
    });
  });

  describe('Auto-save Functionality', () => {
    it('should trigger auto-save after specified delay', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          onAutoSave={mockOnAutoSave}
          autoSaveDelay={500}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      await user.type(titleInput, ' Updated');

      // Fast-forward time to trigger auto-save
      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockOnAutoSave).toHaveBeenCalled();
      });
    });

    it('should debounce auto-save with multiple rapid changes', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          onAutoSave={mockOnAutoSave}
          autoSaveDelay={500}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      
      // Make multiple rapid changes
      await user.type(titleInput, ' A');
      vi.advanceTimersByTime(200);
      
      await user.type(titleInput, 'B');
      vi.advanceTimersByTime(200);
      
      await user.type(titleInput, 'C');
      vi.advanceTimersByTime(200);

      // Auto-save should not have been called yet
      expect(mockOnAutoSave).not.toHaveBeenCalled();

      // Complete the debounce delay
      vi.advanceTimersByTime(500);

      await waitFor(() => {
        // Auto-save should be called only once after all changes
        expect(mockOnAutoSave).toHaveBeenCalledTimes(1);
      });
    });

    it('should show saving indicator during auto-save', async () => {
      const user = userEvent.setup({ delay: null });
      let autoSaveResolve: () => void;
      const autoSavePromise = new Promise<void>((resolve) => {
        autoSaveResolve = resolve;
      });
      
      const slowAutoSave = vi.fn(() => autoSavePromise);
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          onAutoSave={slowAutoSave}
          autoSaveDelay={500}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      await user.type(titleInput, ' Updated');

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      // Resolve the auto-save
      autoSaveResolve!();

      await waitFor(() => {
        expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
      });
    });

    it('should not auto-save in read-only mode', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          onAutoSave={mockOnAutoSave}
          readOnly={true}
          autoSaveDelay={500}
        />
      );

      vi.advanceTimersByTime(1000);

      expect(mockOnAutoSave).not.toHaveBeenCalled();
    });
  });

  describe('Undo/Redo Functionality', () => {
    it('should undo changes', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      const originalValue = titleInput.getAttribute('value');

      // Make a change
      await user.clear(titleInput);
      await user.type(titleInput, 'Changed Title');

      // Click undo
      const buttons = screen.getAllByTestId('button');
      const undoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Undo'));
      
      expect(undoButton).toBeInTheDocument();
      
      if (undoButton) {
        await user.click(undoButton);

        await waitFor(() => {
          expect(titleInput).toHaveValue(originalValue || 'Test Video Script');
        });
      }
    });

    it('should redo changes after undo', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');

      // Make a change
      await user.clear(titleInput);
      await user.type(titleInput, 'Changed Title');

      const buttons = screen.getAllByTestId('button');
      const undoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Undo'));
      const redoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Redo'));

      // Undo
      if (undoButton) {
        await user.click(undoButton);
      }

      // Redo
      if (redoButton) {
        await user.click(redoButton);

        await waitFor(() => {
          expect(titleInput).toHaveValue('Changed Title');
        });
      }
    });

    it('should disable undo button when at beginning of history', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const buttons = screen.getAllByTestId('button');
      const undoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Undo'));

      expect(undoButton).toHaveAttribute('disabled');
    });
  });

  describe('Read-only Mode', () => {
    it('should disable all inputs in read-only mode', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          readOnly={true}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      expect(titleInput).toBeDisabled();

      const textareas = screen.getAllByTestId('textarea');
      textareas.forEach(textarea => {
        expect(textarea).toBeDisabled();
      });
    });

    it('should hide undo/redo buttons in read-only mode', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          readOnly={true}
        />
      );

      const buttons = screen.getAllByTestId('button');
      const undoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Undo'));
      const redoButton = buttons.find(btn => btn.getAttribute('title')?.includes('Redo'));

      expect(undoButton).not.toBeInTheDocument();
      expect(redoButton).not.toBeInTheDocument();
    });
  });

  describe('Character and Duration Tracking', () => {
    it('should display total character count', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const totalChars = mockScript.scenes.reduce((sum, scene) => {
        return sum + (scene.narration?.length || 0) + (scene.description?.length || 0);
      }, 0);

      expect(screen.getByText(totalChars.toString())).toBeInTheDocument();
      expect(screen.getByText('Characters')).toBeInTheDocument();
    });

    it('should display estimated word count', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const totalChars = mockScript.scenes.reduce((sum, scene) => {
        return sum + (scene.narration?.length || 0) + (scene.description?.length || 0);
      }, 0);

      const estimatedWords = Math.ceil(totalChars / 150);

      expect(screen.getByText(estimatedWords.toString())).toBeInTheDocument();
      expect(screen.getByText('Est. Words')).toBeInTheDocument();
    });

    it('should update total duration when scene duration changes', async () => {
      const user = userEvent.setup({ delay: null });
      
      const { rerender } = render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      // Initial total duration
      expect(screen.getByText('60s')).toBeInTheDocument();

      // Update a scene duration
      const updatedScript = {
        ...mockScript,
        scenes: [
          { ...mockScript.scenes[0], duration: 30 },
          ...mockScript.scenes.slice(1),
        ],
        totalDuration: 70, // 30 + 25 + 15
      };

      rerender(
        <VideoScriptEditor
          script={updatedScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      expect(screen.getByText('70s')).toBeInTheDocument();
    });
  });

  describe('Callbacks', () => {
    it('should call onScriptUpdate when script changes', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      await user.type(titleInput, ' Updated');

      await waitFor(() => {
        expect(mockOnScriptUpdate).toHaveBeenCalled();
      });
    });

    it('should call onSceneUpdate when scene changes', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onSceneUpdate={mockOnSceneUpdate}
        />
      );

      const textareas = screen.getAllByTestId('textarea');
      const firstTextarea = textareas[0];

      await user.type(firstTextarea, ' Updated');

      await waitFor(() => {
        expect(mockOnSceneUpdate).toHaveBeenCalled();
      });
    });

    it('should pass updated script to onAutoSave', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
          onAutoSave={mockOnAutoSave}
          autoSaveDelay={500}
        />
      );

      const titleInput = screen.getByDisplayValue('Test Video Script');
      await user.type(titleInput, ' Updated');

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockOnAutoSave).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringContaining('Updated'),
          })
        );
      });
    });
  });

  describe('Scene Display', () => {
    it('should display scene badges with duration', () => {
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      mockScript.scenes.forEach(scene => {
        const badges = screen.getAllByText(`${scene.duration}s`);
        expect(badges.length).toBeGreaterThan(0);
      });
    });

    it('should highlight currently editing scene', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <VideoScriptEditor
          script={mockScript}
          onScriptUpdate={mockOnScriptUpdate}
        />
      );

      const textareas = screen.getAllByTestId('textarea');
      const firstTextarea = textareas[0];

      await user.click(firstTextarea);

      const cards = screen.getAllByTestId('card');
      const sceneCard = cards.find(card => 
        card.className.includes('ring-2 ring-purple-500')
      );

      expect(sceneCard).toBeInTheDocument();
    });
  });
});
