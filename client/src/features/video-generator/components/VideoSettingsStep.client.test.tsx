import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VideoSettingsStep } from './VideoSettingsStep';
import { VideoSettings } from '../types';

describe('VideoSettingsStep', () => {
  let mockSettings: VideoSettings;
  let mockSetSettings: ReturnType<typeof vi.fn>;
  let mockOnNext: ReturnType<typeof vi.fn>;
  let mockOnBack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSettings = {
      duration: 60,
      aspectRatio: '16:9',
      resolution: '1080p',
      fps: 30,
      motionEngine: 'Auto',
      visualStyle: 'cinematic',
      voiceGender: 'female',
      voiceLanguage: 'English',
      voiceAccent: 'American',
      voiceTone: 'professional',
      voiceStability: 0.4,
      voiceSimilarity: 0.75,
      backgroundMusic: true,
      musicGenre: 'corporate',
      musicVolume: 0.3,
      avatar: false,
      avatarStyle: 'realistic',
      avatarPosition: 'corner',
      language: 'en',
      captions: true,
      captionStyle: 'modern',
      onScreenText: true,
      transitions: 'smooth',
      colorScheme: 'vibrant',
      zoomEffects: true,
      fadeTransitions: true,
      enableWatermark: true,
      enableLogo: false,
      speedControl: 1.0,
      enableColorGrading: true,
      voiceEnabled: false,
      effects: [],
      transitionStyle: 'smooth',
    };

    mockSetSettings = vi.fn((updater) => {
      if (typeof updater === 'function') {
        mockSettings = updater(mockSettings);
      }
    });
    mockOnNext = vi.fn();
    mockOnBack = vi.fn();
  });

  describe('Component Rendering', () => {
    it('should render the video settings form with all sections', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText('Configure Your Video Settings')).toBeInTheDocument();
      expect(screen.getByText('Duration & Quality')).toBeInTheDocument();
      expect(screen.getByText('Motion Engine')).toBeInTheDocument();
      expect(screen.getByText('Voice & Audio')).toBeInTheDocument();
      expect(screen.getByText('Avatar & Visual Features')).toBeInTheDocument();
      expect(screen.getByText('Effects & Transitions')).toBeInTheDocument();
      expect(screen.getByText('Background Music')).toBeInTheDocument();
      expect(screen.getByText('Cost Estimation')).toBeInTheDocument();
    });

    it('should display progress indicator showing step 2 of 5', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText('Step 2 of 5 - Video Configuration')).toBeInTheDocument();
    });

    it('should render Back and Continue buttons', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue to script/i })).toBeInTheDocument();
    });
  });

  describe('Duration Settings', () => {
    it('should display current duration value', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const durationSelect = screen.getByLabelText('Video Duration');
      expect(durationSelect).toHaveValue('60');
    });

    it('should update duration when changed', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const durationSelect = screen.getByLabelText('Video Duration');
      fireEvent.change(durationSelect, { target: { value: '90' } });
      
      expect(mockSetSettings).toHaveBeenCalled();
    });

    it('should show validation error for invalid duration', async () => {
      const invalidSettings = { ...mockSettings, duration: 200 }; // > 180
      
      render(
        <VideoSettingsStep
          settings={invalidSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue to script/i });
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText('Duration must be between 5 and 180 seconds')).toBeInTheDocument();
      });
      
      expect(mockOnNext).not.toHaveBeenCalled();
    });
  });

  describe('Aspect Ratio Settings', () => {
    it('should display current aspect ratio', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const aspectRatioSelect = screen.getByLabelText('Aspect Ratio');
      expect(aspectRatioSelect).toHaveValue('16:9');
    });

    it('should update aspect ratio when changed', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const aspectRatioSelect = screen.getByLabelText('Aspect Ratio');
      fireEvent.change(aspectRatioSelect, { target: { value: '9:16' } });
      
      expect(mockSetSettings).toHaveBeenCalled();
    });

    it('should show validation error for invalid aspect ratio', async () => {
      const invalidSettings = { ...mockSettings, aspectRatio: '21:9' }; // Invalid
      
      render(
        <VideoSettingsStep
          settings={invalidSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue to script/i });
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid aspect ratio selected')).toBeInTheDocument();
      });
      
      expect(mockOnNext).not.toHaveBeenCalled();
    });
  });

  describe('Resolution Settings', () => {
    it('should display current resolution', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const resolutionSelect = screen.getByLabelText('Resolution');
      expect(resolutionSelect).toHaveValue('1080p');
    });

    it('should update resolution when changed', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const resolutionSelect = screen.getByLabelText('Resolution');
      fireEvent.change(resolutionSelect, { target: { value: '4K' } });
      
      expect(mockSetSettings).toHaveBeenCalled();
    });
  });

  describe('Form Validation', () => {
    it('should allow form submission with valid settings', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue to script/i });
      fireEvent.click(continueButton);
      
      expect(mockOnNext).toHaveBeenCalled();
    });

    it('should prevent form submission with invalid FPS', async () => {
      const invalidSettings = { ...mockSettings, fps: 25 }; // Invalid FPS
      
      render(
        <VideoSettingsStep
          settings={invalidSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue to script/i });
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText('FPS must be 24, 30, or 60')).toBeInTheDocument();
      });
      
      expect(mockOnNext).not.toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should call onBack when Back button is clicked', () => {
      render(
        <VideoSettingsStep
          settings={mockSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);
      
      expect(mockOnBack).toHaveBeenCalled();
    });
  });

  describe('Credit Estimation', () => {
    it('should calculate credits correctly for Runway Gen-2', () => {
      const runwaySettings = { ...mockSettings, motionEngine: 'Runway Gen-2', duration: 60 };
      
      render(
        <VideoSettingsStep
          settings={runwaySettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      // 60s video = 4 scenes at ~15s each, Runway Gen-2 = 15 credits/scene
      // Expected: 4 * 15 = 60 credits
      expect(screen.getByText(/60 credits/i)).toBeInTheDocument();
    });

    it('should increase credits estimate when avatar is enabled', () => {
      const avatarSettings = { ...mockSettings, avatar: true, duration: 30 };
      
      render(
        <VideoSettingsStep
          settings={avatarSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      // Avatar should add ~10 credits per scene
      expect(screen.getByText(/\+10 credits\/scene/i)).toBeInTheDocument();
    });

    it('should show 50% increase for 4K resolution', () => {
      const fourKSettings = { ...mockSettings, resolution: '4K' };
      
      render(
        <VideoSettingsStep
          settings={fourKSettings}
          setSettings={mockSetSettings}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/4K \(\+50%\)/i)).toBeInTheDocument();
    });
  });
});
