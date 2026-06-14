/**
 * Shared types for VideoSettings sub-components
 */

import { VideoSettings } from '../../types';

export interface VideoSettingsCardProps {
  settings: VideoSettings;
  setSettings: React.Dispatch<React.SetStateAction<VideoSettings>>;
  errors: Record<string, string>;
}
