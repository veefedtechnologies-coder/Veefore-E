# VideoScriptEditor Component

## Overview

The `VideoScriptEditor` is a comprehensive rich text editor component for editing AI-generated video scripts. Extracted from the monolithic `VideoGeneratorAdvanced.tsx` (3,125 lines) as part of the codebase refactoring initiative.

**Location:** `/client/src/features/video-generator/components/VideoScriptEditor.tsx`

**Requirements:** 2.2, 2.4 (Codebase Refactoring and Optimization)

## Features

### Core Functionality

1. **Scene-Based Editing**
   - Edit individual scenes with dedicated fields
   - Visual description, visual elements, narration, and duration
   - Scene numbering and visual indicators

2. **Auto-Save with Debouncing**
   - Automatic saving after 500ms (configurable) of inactivity
   - Prevents excessive save operations
   - Visual feedback for save status

3. **Undo/Redo Support**
   - Maintains history of up to 50 changes
   - Keyboard shortcuts support (Ctrl+Z, Ctrl+Y)
   - Visual indicators for undo/redo availability

4. **Rich Text Editing**
   - Multi-line text areas for descriptions and narration
   - Real-time character counting
   - Visual syntax highlighting through styling

5. **Duration Tracking**
   - Per-scene duration editing
   - Automatic total duration calculation
   - Visual badges showing scene durations

6. **Read-Only Mode**
   - View-only mode for script review
   - Disables all editing controls
   - Hides edit-specific UI elements

## Props

```typescript
interface VideoScriptEditorProps {
  /** The generated script to edit */
  script: GeneratedScript;
  
  /** Callback when script is updated */
  onScriptUpdate?: (script: GeneratedScript) => void;
  
  /** Callback when a scene is updated */
  onSceneUpdate?: (sceneId: string, updatedScene: ScriptScene) => void;
  
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  
  /** Auto-save delay in milliseconds (default: 500ms) */
  autoSaveDelay?: number;
  
  /** Callback when auto-save occurs */
  onAutoSave?: (script: GeneratedScript) => void;
  
  /** Class name for custom styling */
  className?: string;
}
```

## Usage

### Basic Usage

```tsx
import { VideoScriptEditor } from '@/features/video-generator';

function MyComponent() {
  const [script, setScript] = useState<GeneratedScript>(initialScript);

  return (
    <VideoScriptEditor
      script={script}
      onScriptUpdate={setScript}
    />
  );
}
```

### With Auto-Save

```tsx
import { VideoScriptEditor } from '@/features/video-generator';

function MyComponent() {
  const [script, setScript] = useState<GeneratedScript>(initialScript);

  const handleAutoSave = async (updatedScript: GeneratedScript) => {
    // Save to backend
    await saveScript(updatedScript);
  };

  return (
    <VideoScriptEditor
      script={script}
      onScriptUpdate={setScript}
      onAutoSave={handleAutoSave}
      autoSaveDelay={1000} // 1 second delay
    />
  );
}
```

### Read-Only Mode

```tsx
import { VideoScriptEditor } from '@/features/video-generator';

function ScriptPreview({ script }: { script: GeneratedScript }) {
  return (
    <VideoScriptEditor
      script={script}
      readOnly={true}
    />
  );
}
```

### With Scene Update Tracking

```tsx
import { VideoScriptEditor } from '@/features/video-generator';

function MyComponent() {
  const [script, setScript] = useState<GeneratedScript>(initialScript);

  const handleSceneUpdate = (sceneId: string, updatedScene: ScriptScene) => {
    console.log(`Scene ${sceneId} updated:`, updatedScene);
    // Track changes, trigger analytics, etc.
  };

  return (
    <VideoScriptEditor
      script={script}
      onScriptUpdate={setScript}
      onSceneUpdate={handleSceneUpdate}
    />
  );
}
```

## Component Structure

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Editor Header                                        │
│ - Title, Save Status, Undo/Redo, Save Button       │
├─────────────────────────────────────────────────────┤
│ Script Overview                                      │
│ - Scenes Count, Total Duration, Character Count     │
│ - Video Title Input                                  │
├─────────────────────────────────────────────────────┤
│ Scene 1                                              │
│ - Visual Description                                 │
│ - Visual Elements                                    │
│ - Voiceover/Narration                               │
│ - Scene Duration                                     │
├─────────────────────────────────────────────────────┤
│ Scene 2                                              │
│ ...                                                  │
├─────────────────────────────────────────────────────┤
│ Scene N                                              │
│ ...                                                  │
├─────────────────────────────────────────────────────┤
│ Editor Footer                                        │
│ - Auto-save Info                                     │
└─────────────────────────────────────────────────────┘
```

### State Management

The component manages the following internal state:

- `script`: Current script being edited
- `isSaving`: Whether auto-save is in progress
- `lastSaved`: Timestamp of last successful save
- `hasUnsavedChanges`: Whether there are unsaved changes
- `editingSceneId`: ID of currently focused scene
- `history`: Array of previous script states
- `historyIndex`: Current position in history

## Auto-Save Behavior

### Debouncing Logic

1. User makes a change to the script
2. `hasUnsavedChanges` is set to `true`
3. Previous auto-save timer is cleared
4. New timer is started with `autoSaveDelay` milliseconds
5. If another change occurs, timer is reset (steps 2-4)
6. When timer expires, auto-save is triggered
7. `onAutoSave` callback is invoked with current script
8. `lastSaved` timestamp is updated
9. `hasUnsavedChanges` is set to `false`

### Visual Feedback

- **Saving:** Spinner icon + "Saving..." text
- **Unsaved Changes:** Warning icon + "Unsaved changes" text
- **Saved:** Checkmark icon + "Saved {time}" text

## Undo/Redo Implementation

### History Management

- Maximum of 50 history entries
- Each entry includes script state and timestamp
- When history exceeds 50 entries, oldest entry is removed
- Undo: Move historyIndex backward
- Redo: Move historyIndex forward
- New changes clear any "future" history

### Keyboard Shortcuts

- **Undo:** Ctrl+Z (or Cmd+Z on Mac)
- **Redo:** Ctrl+Y (or Cmd+Shift+Z on Mac)

*Note: Browser native keyboard shortcuts are used; component responds to button clicks*

## Scene Editing

### Editable Fields

1. **Visual Description** (Textarea)
   - Description of what viewers see
   - Multiline text input
   - Placeholder: "Describe what viewers will see in this scene..."

2. **Visual Elements** (Input)
   - Camera angles, lighting, composition details
   - Single-line text input
   - Placeholder: "Camera angles, lighting, composition..."

3. **Voiceover/Narration** (Textarea)
   - What the narrator says
   - Multiline text input with italic styling
   - Placeholder: "What the narrator will say during this scene..."

4. **Scene Duration** (Number Input)
   - Duration in seconds
   - Min: 1, Max: 60
   - Affects total video duration

### Scene Highlighting

When a field is focused:
- Scene card gets purple ring border
- `editingSceneId` is set to the scene's ID
- Visual indicator for active editing

## Statistics Tracking

### Overview Statistics

1. **Scenes Count**
   - Total number of scenes in script
   - Updated automatically when scenes array changes

2. **Total Duration**
   - Sum of all scene durations
   - Displayed in seconds
   - Recalculated when any scene duration changes

3. **Character Count**
   - Sum of all narration and description characters
   - Helps estimate script length

4. **Estimated Words**
   - Character count / 150 (average word length)
   - Rough estimate for script complexity

## Styling

### Theme Support

The component supports both light and dark themes using Tailwind's dark mode:

- Light theme: White backgrounds, gray borders
- Dark theme: Gray-800 backgrounds, gray-700 borders
- Automatic text color adjustment
- Gradient accents remain consistent

### Customization

Add custom styling via the `className` prop:

```tsx
<VideoScriptEditor
  script={script}
  className="max-w-4xl mx-auto my-8"
/>
```

## Performance Considerations

### Optimizations

1. **Debounced Auto-Save**
   - Prevents excessive API calls
   - Configurable delay (default 500ms)

2. **Limited History**
   - Maximum 50 history entries
   - Prevents memory bloat

3. **Ref-Based Script Access**
   - Uses `scriptRef` for auto-save
   - Avoids stale closure issues

4. **Conditional Rendering**
   - Read-only mode hides unnecessary UI
   - Reduces DOM complexity

### Recommended Practices

1. **Memoize Callbacks**
   ```tsx
   const handleAutoSave = useCallback(async (script) => {
     await saveScript(script);
   }, []);
   ```

2. **Debounce External Updates**
   - If script updates come from external sources
   - Debounce to avoid conflict with user edits

3. **Consider Lazy Loading**
   - For very large scripts (50+ scenes)
   - Implement virtual scrolling

## Testing

### Test Coverage

The component includes comprehensive tests for:

- ✅ Rendering and UI elements
- ✅ Auto-save functionality with debouncing
- ✅ Undo/redo operations
- ✅ Scene editing (all fields)
- ✅ Read-only mode
- ✅ Character and duration tracking
- ✅ Callback invocations

### Running Tests

```bash
# Run all tests
npm run test

# Run component tests
npm run test VideoScriptEditor

# Run with coverage
npm run test:coverage
```

### Example Test

```typescript
it('should trigger auto-save after specified delay', async () => {
  const mockAutoSave = vi.fn();
  
  render(
    <VideoScriptEditor
      script={mockScript}
      onAutoSave={mockAutoSave}
      autoSaveDelay={500}
    />
  );

  const titleInput = screen.getByDisplayValue('Test Video Script');
  await userEvent.type(titleInput, ' Updated');

  // Fast-forward time
  vi.advanceTimersByTime(500);

  await waitFor(() => {
    expect(mockAutoSave).toHaveBeenCalled();
  });
});
```

## Integration with VideoGeneratorAdvanced

### Before Refactoring

```tsx
// VideoGeneratorAdvanced.tsx (3,125 lines)
const renderScriptStep = () => {
  return (
    <div>
      {/* Inline script editing UI - 400+ lines */}
    </div>
  );
};
```

### After Refactoring

```tsx
// VideoGeneratorAdvanced.tsx
import { VideoScriptEditor } from '@/features/video-generator';

const renderScriptStep = () => {
  return (
    <VideoScriptEditor
      script={generatedScript}
      onScriptUpdate={setGeneratedScript}
      onAutoSave={handleAutoSave}
    />
  );
};
```

## Accessibility

### Keyboard Navigation

- All inputs are keyboard accessible
- Tab order follows logical flow
- Undo/Redo buttons have titles for screen readers

### ARIA Labels

- Form fields have associated labels
- Status indicators have descriptive text
- Buttons have accessible names

### Color Contrast

- Text meets WCAG AA standards
- Dark mode maintains contrast ratios
- Icons have text alternatives

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Polyfills Required

- None (uses standard React and DOM APIs)

## Dependencies

- React 18+
- @/components/ui/* (shadcn/ui components)
- lucide-react (icons)

## Future Enhancements

### Planned Features

1. **Rich Text Formatting**
   - Bold, italic, underline support
   - Markdown preview mode

2. **Collaboration**
   - Real-time multi-user editing
   - Change tracking and comments

3. **Templates**
   - Pre-defined scene templates
   - Quick scene insertion

4. **AI Suggestions**
   - Grammar and style improvements
   - Narration alternatives

5. **Export Options**
   - Export to PDF, Word, or plain text
   - Scene breakdown sheets

## Troubleshooting

### Auto-Save Not Working

**Problem:** Changes aren't being saved automatically

**Solutions:**
1. Check that `onAutoSave` callback is provided
2. Ensure `autoSaveDelay` is set (default 500ms)
3. Verify `readOnly` prop is not true
4. Check browser console for errors

### Undo/Redo Not Working

**Problem:** Undo/Redo buttons are disabled or not working

**Solutions:**
1. Make at least one change to enable undo
2. Check that component is not in read-only mode
3. Ensure history is not corrupted (check console)

### Performance Issues

**Problem:** Editor is slow with large scripts

**Solutions:**
1. Increase `autoSaveDelay` to reduce save frequency
2. Implement pagination for scripts with 20+ scenes
3. Use React.memo() on parent components
4. Profile with React DevTools

## Contributing

When contributing to this component:

1. **Maintain Test Coverage**
   - Add tests for new features
   - Maintain >80% coverage

2. **Follow Code Style**
   - Use TypeScript strict mode
   - Add JSDoc comments for public APIs

3. **Document Changes**
   - Update this documentation
   - Add inline comments for complex logic

4. **Performance**
   - Profile changes with React DevTools
   - Avoid unnecessary re-renders

## Related Components

- **VideoPromptStep** - Initial prompt input step
- **VideoSettingsStep** - Video configuration step
- **VideoPreview** - Final video preview step

## License

Part of the Veefore-E application. See root LICENSE file.

## Changelog

### v1.0.0 (Current)
- ✨ Initial release
- ✅ Auto-save with debouncing
- ✅ Undo/redo support
- ✅ Scene-based editing
- ✅ Duration and character tracking
- ✅ Read-only mode
- ✅ Dark mode support
- ✅ Comprehensive test suite
