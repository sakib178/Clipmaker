export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: SubtitleWord[];
}

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export type TextCase = 'uppercase' | 'capitalize' | 'none';

export type SubtitleAnimation = 'karaoke-bounce' | 'karaoke-glow' | 'fade' | 'box-pop' | 'static';

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number; // in pt/px relative to standard canvas (smaller than 18px supported, e.g. 10-96px)
  textColor: string;
  highlightColor: string; // active word color
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  boxBackground: boolean;
  boxColor: string;
  boxOpacity: number;
  textCase: TextCase;
  positionY: number; // 5 to 95 %
  positionX: number; // 5 to 95 %
  boxWidth: number; // 20 to 100 % for stretching and spreading text
  animation: SubtitleAnimation;
  wordsPerLine: number; // 1 to 6
  direction: 'ltr' | 'rtl' | 'auto';
  letterSpacing: number;
  showSubtitles?: boolean; // toggle subtitle visibility
}

export interface ClipTitleConfig {
  enabled: boolean;
  text: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  boxBackground: boolean;
  boxColor: string;
  boxOpacity: number;
  textCase: TextCase;
  positionX: number; // 5 to 95 %
  positionY: number; // 5 to 95 %
  boxWidth: number; // 20 to 100 % for stretching/spreading text
  letterSpacing: number;
  direction: 'ltr' | 'rtl' | 'auto';
}

export type BackgroundFit = 'cover' | 'contain' | 'blur-mirror';

export interface BackgroundConfig {
  type: 'none' | 'video' | 'image' | 'preset-video' | 'gradient' | 'youtube-video';
  src: string;
  name: string;
  youtubeVideoId?: string;
  canvaDesignUrl?: string;
  aspectRatio: AspectRatio;
  fit: BackgroundFit;
  blur: number; // 0-20
  darkenOverlay: number; // 0 - 0.9
  scale: number; // 0.8 - 2.5
  offsetX: number; // -100 to 100
  offsetY: number; // -100 to 100
  brightness: number; // 50 to 150
  contrast: number; // 50 to 150
  showVisualizer: boolean;
  visualizerStyle: 'bars' | 'wave' | 'circle' | 'off';
  visualizerColor: string;
}

export interface CanvaDesignItem {
  exportable?: boolean;
  id: string;
  title: string;
  aspectRatio: AspectRatio;
  previewUrl: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'gradient';
  canvaEditUrl?: string;
  updatedAt: string;
}

export interface CanvaAccountConfig {
  connected: boolean;
  accountName: string;
  email: string;
  workspaceName: string;
  authMethod: 'oauth' | 'api_token' | 'workspace_link';
  accessTokenPreview?: string;
  connectedAt?: string;
  designs: CanvaDesignItem[];
}

export interface AudioSource {
  type: 'upload' | 'youtube' | 'preset' | 'url';
  src: string;
  name: string;
  author?: string;
  thumbnail?: string;
  videoId?: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  ytStartOffset?: number;
  ytEndOffset?: number;
  youtubeUrl?: string;
  volume: number; // 0 to 2
}

export type ExportResolution = '720p' | '1080p' | '1440p' | '4k';
export type ExportFPS = 24 | 30 | 60;
export type ExportFormat = 'webm' | 'mp4';

export interface ExportConfig {
  resolution: ExportResolution;
  fps: ExportFPS;
  format: ExportFormat;
  bitrateMbps: number;
}

export type SocialPlatformId =
  | 'tiktok'
  | 'instagram'
  | 'youtube_shorts'
  | 'x_twitter'
  | 'facebook_reels'
  | 'linkedin';

export interface SocialAccountConnection {
  id: SocialPlatformId;
  name: string;
  handle: string;
  connected: boolean;
  enabledForPost: boolean;
  authMethod?: 'oauth' | 'api_token' | 'n8n_credential';
  credentialName?: string;
  connectedAt?: string;
}

export interface N8nExecutionLog {
  executionId: string;
  timestamp: string;
  webhookStatus: number;
  webhookResponseText: string;
  clipTitle: string;
  results: { platform: string; name: string; handle: string; status: string; postUrl?: string }[];
}

export interface N8nConfig {
  webhookUrl: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  caption: string;
  hashtags: string;
  scheduleMode: 'immediate' | 'scheduled';
  scheduledTime?: string;
  accounts: SocialAccountConnection[];
  lastExportedMp4Url?: string;
  executions?: N8nExecutionLog[];
}
