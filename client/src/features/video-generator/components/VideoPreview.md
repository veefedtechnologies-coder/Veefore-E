# VideoPreview Component

## Overview

The `VideoPreview` component is a comprehensive video player with advanced playback controls and scene navigation features. It was extracted from `VideoGeneratorAdvanced.tsx` as part of Task 3.4 of the codebase refactoring initiative.

**Line Count**: ~350 lines  
**Requirements**: 2.2, 5.4

## Features

### 1. Video Player with Advanced Controls
- **Playback Controls**: Play/pause, skip forward/backward (10s increments)
- **Timeline Scrubbing**: Interactive slider for seeking to any point in the video
- **Volume Control**: Slider and mute/unmute button
- **Fullscreen Mode**: Enter/exit fullscreen
- **Time Display**: Current time / total duration (MM:SS format)

### 2. Generation Progress Display
- Real-time progress indicator during video generation
- Step-by-step generation process visualization:
  - Script processed
  - AI scenes generated
  - Motion applied
  - Voiceover added
  - Final video compilation

### 3. Scene Navigation
- Thumbnail preview grid for all scenes
- Click to jump to specific scene timestamp
- Scene descriptions and timestamps
- Show/hide toggle for thumbnail grid

### 4. Video Details & Configuration Display
- Video specifications (duration, resolution, aspect ratio, style)
- Enabled features badges (music, captions, avatar, voice, effects)
- Clean, organized layout

### 5. Action Buttons
- **Download**: Download the generated video
- **Edit Settings**: Return to settings editor
- **Create New**: Start a new video project

## Props

```typescript
interface VideoPreviewProps {
  /** Video job containing the video URL and metadata */
  videoJob: VideoJob | null;
  
  /** Video settings for displaying configuration details */
  settings: VideoSettings;
  
  /** Callback when download button is clicked */
  onDownload?: () => void;
  
  /** Callback when edit settings button is clicked */
  onEditSettings?: () => void;
  
  /** Callback when create new button is clicked */
  onCreateNew?: () => void;
  
  /** Whether the video is currently generating */
  isGenerating?: boolean;
  
  /** Generation progress (0-100) */
  generationProgress?: number;
  
  /** Current generation step description */
  currentStep?: string;
}
```

## Usage Examples

### Basic Usage - Completed Video

```tsx
import { VideoPreview } from '@/features/video-generator';

function VideoGeneratorPage() {
  const videoJob = {
    id: 'job-123',
    title: 'My AI Video',
    finalVideo: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    status: 'completed',
    progress: 100,
    script: {
      title: 'My Script',
      scenes: [
        { id: 'scene-1', duration: 20, description: 'Opening scene' },
        { id: 'scene-2', duration: 20, description: 'Middle content' },
        { id: 'scene-3', duration: 20, description: 'Closing' }
      ],
      totalDuration: 60,
      hook: 'Attention-grabbing hook',
      callToAction: 'Subscribe!'
    }
  };

  const settings = {
    duration: 60,
    aspectRatio: '16:9',
    resolution: '1080p',
    visualStyle: 'cinematic',
    backgroundMusic: true,
    captions: true,
    voiceEnabled: true,
    voiceGender: 'female',
    // ... other settings
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = videoJob.finalVideo;
    link.download = `${videoJob.title}.mp4`;
    link.click();
  };

  return (
    <VideoPreview
      videoJob={videoJob}
      settings={settings}
      onDownload={handleDownload}
      onEditSettings={() => setCurrentStep('settings')}
      onCreateNew={() => resetWorkflow()}
    />
  );
}
```

### Showing Generation Progress

```tsx
<VideoPreview
  videoJob={null}
  settings={settings}
  isGenerating={true}
  generationProgress={75}
  currentStep="Adding voiceover and music..."
/>
```

### Empty State (No Video)

```tsx
<VideoPreview
  videoJob={null}
  settings={settings}
/>
```

## Component Structure

### Main Sections

1. **Generation Progress View** (`isGenerating === true`)
   - Progress indicator with percentage
   - Step-by-step process visualization
   - Animated loading state

2. **Empty State** (`videoJob === null && !isGenerating`)
   - Placeholder message
   - Play icon visual

3. **Video Player View** (`videoJob?.finalVideo exists`)
   - Video element with controls overlay
   - Scene thumbnail grid (collapsible)
   - Video details panel
   - Action buttons

### Control Elements

#### Timeline Controls
- Main timeline slider for scrubbing
- Appears on hover over video
- Shows current time / total duration

#### Playback Buttons
- Play/Pause (center overlay + bottom control bar)
- Skip Backward (-10s)
- Skip Forward (+10s)

#### Volume Controls
- Mute/unmute button
- Volume slider (0-100%)

#### Scene Thumbnails
- Grid layout (4 columns)
- Hover effect with play icon overlay
- Click to seek to scene timestamp
- Shows scene description and timestamp

## State Management

The component manages the following internal state:

```typescript
// Video player state
const videoRef = useRef<HTMLVideoElement>(null);
const [isPlaying, setIsPlaying] = useState(false);
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);
const [volume, setVolume] = useState(1);
const [isMuted, setIsMuted] = useState(false);
const [isFullscreen, setIsFullscreen] = useState(false);

// UI state
const [showThumbnails, setShowThumbnails] = useState(false);
const [sceneThumbnails, setSceneThumbnails] = useState<ThumbnailScene[]>([]);
```

## Key Functions

### Playback Control
- `togglePlay()`: Play/pause video
- `handleSeek(value)`: Seek to specific timestamp
- `skipBackward()`: Skip back 10 seconds
- `skipForward()`: Skip forward 10 seconds

### Volume Control
- `handleVolumeChange(value)`: Adjust volume (0-1)
- `toggleMute()`: Mute/unmute audio

### Display Control
- `toggleFullscreen()`: Enter/exit fullscreen mode
- `seekToScene(timestamp)`: Jump to specific scene

### Utility Functions
- `formatTime(seconds)`: Format seconds as MM:SS

## Styling & Accessibility

### Styling Features
- Dark mode support via Tailwind classes
- Smooth transitions and hover effects
- Gradient overlays for controls
- Responsive grid layout for thumbnails

### Accessibility
- ARIA labels on all interactive buttons
- Keyboard-accessible controls (via native video element)
- Semantic HTML structure
- Screen reader-friendly progress indicators

## Integration with Video Generator Workflow

### Workflow Position
The VideoPreview component is typically the final step in the video generation workflow:

1. **Prompt Input** → `VideoPromptStep`
2. **Settings Configuration** → `VideoSettingsStep`  
3. **Script Editing** → `VideoScriptEditor`
4. **Video Generation & Preview** → `VideoPreview` ← **You are here**

### Data Flow

```typescript
// Parent component (VideoGeneratorAdvanced.tsx or custom page)
const { videoJob, settings } = useVideoGeneration();

// Pass to VideoPreview
<VideoPreview
  videoJob={videoJob}
  settings={settings}
  onEditSettings={() => setCurrentStep('settings')}
  onCreateNew={() => resetWorkflow()}
/>
```

## Browser Compatibility

### Video Format Support
- MP4 (H.264): Universal support
- WebM: Modern browsers
- Poster images: JPEG/PNG

### Feature Support
- **Fullscreen API**: All modern browsers
- **Video element**: All browsers
- **Range input (sliders)**: All browsers

### Fallbacks
- Controls show on mobile (no hover state)
- Graceful degradation for older browsers
- Poster image shown before video loads

## Performance Considerations

### Video Loading
- Lazy loading via React.lazy can be applied at page level
- Poster image provides instant visual feedback
- Video preloading handled by browser

### Scene Thumbnails
- Generated on-demand from script data
- Collapsible to reduce DOM size
- Could be enhanced with actual frame captures

### Event Listeners
- Properly cleaned up on unmount via useEffect return
- Throttled for time updates to prevent excessive re-renders

## Future Enhancements

### Potential Features
1. **Picture-in-Picture Mode**: Allow video to float while scrolling
2. **Playback Speed Control**: 0.5x, 1x, 1.5x, 2x options
3. **Keyboard Shortcuts**: Space (play/pause), arrow keys (seek), M (mute)
4. **Chapters/Markers**: Visual markers on timeline for scene boundaries
5. **Quality Selector**: Switch between resolution options
6. **Share Options**: Social media sharing, embed code
7. **Thumbnail Preview on Hover**: Show frame preview when hovering over timeline
8. **Auto-play Next**: Queue and play multiple videos
9. **Subtitle Toggle**: Show/hide captions programmatically
10. **Loop Controls**: Repeat video or specific sections

### Accessibility Improvements
- Custom keyboard navigation
- Screen reader announcements for state changes
- High contrast mode support
- Closed caption customization (size, position, style)

## Testing

### Manual Testing Checklist
- [ ] Video loads and displays correctly
- [ ] Play/pause toggle works
- [ ] Timeline seeking updates video position
- [ ] Volume control adjusts audio
- [ ] Mute/unmute toggles audio
- [ ] Fullscreen mode works
- [ ] Scene thumbnails display and navigate correctly
- [ ] Generation progress shows correctly
- [ ] Empty state displays appropriately
- [ ] All callbacks fire correctly (download, edit, create new)
- [ ] Video details display accurate information
- [ ] Feature badges render based on settings

### Unit Test Coverage
- Component rendering in different states (generating, empty, with video)
- Prop validation and default values
- Callback invocation
- State management (play/pause, volume, seeking)
- Time formatting utility
- Scene thumbnail generation

## Related Components

- **VideoPromptStep**: First step in workflow
- **VideoSettingsStep**: Configure video parameters
- **VideoScriptEditor**: Edit generated script
- **useVideoGeneration**: Hook providing video state and actions

## Dependencies

### UI Components (shadcn/ui)
- Card, CardContent
- Button
- Badge
- Progress
- Slider

### Icons (lucide-react)
- Play, Pause, SkipBack, SkipForward
- Volume2, VolumeX, Maximize
- Download, Settings

### Types
- VideoJob, VideoSettings, ScriptScene from `../types`

## Migration Notes

### From VideoGeneratorAdvanced.tsx
The video preview functionality was previously embedded in the `renderPreview()` function within `VideoGeneratorAdvanced.tsx`. The extraction involved:

1. Moving video player JSX to dedicated component
2. Extracting state management for player controls
3. Creating proper TypeScript interfaces for props
4. Adding scene thumbnail grid feature (enhancement)
5. Improving playback controls (hover overlay, better UX)

### Breaking Changes
None - this is a new component extraction, not a refactor of existing exports.

### Backwards Compatibility
The parent `VideoGeneratorAdvanced.tsx` component can continue to work with the original inline implementation during gradual migration.

## License

Part of the Veefore-E application. Internal component for video generation feature.
