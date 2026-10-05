import { AspectRatio, ExportResolution, SubtitleCue, SubtitleStyle } from '../types';

export interface FontOption {
  id: string;
  name: string;
  family: string;
  language: 'all' | 'en' | 'ar';
  previewText: string;
  tag: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  // Arabic Fonts
  {
    id: 'cairo',
    name: 'Cairo (القاهرة)',
    family: "'Cairo', sans-serif",
    language: 'ar',
    previewText: 'النجاح يبدأ بخطوة',
    tag: 'Arabic Modern Bold',
  },
  {
    id: 'tajawal',
    name: 'Tajawal (تجوال)',
    family: "'Tajawal', sans-serif",
    language: 'ar',
    previewText: 'إبداع بلا حدود',
    tag: 'Arabic Geometric',
  },
  {
    id: 'almarai',
    name: 'Almarai (المراعي)',
    family: "'Almarai', sans-serif",
    language: 'ar',
    previewText: 'وضوح وأناقة عصرية',
    tag: 'Arabic Modern Clean',
  },
  {
    id: 'noto-kufi',
    name: 'Noto Kufi Arabic (كوفي)',
    family: "'Noto Kufi Arabic', sans-serif",
    language: 'ar',
    previewText: 'خط كوفي قوي وجذاب',
    tag: 'Arabic Kufic Punchy',
  },
  {
    id: 'alexandria',
    name: 'Alexandria (الإسكندرية)',
    family: "'Alexandria', sans-serif",
    language: 'ar',
    previewText: 'رؤية جديدة للمستقبل',
    tag: 'Arabic Minimalist',
  },
  {
    id: 'ibm-plex-arabic',
    name: 'IBM Plex Arabic',
    family: "'IBM Plex Sans Arabic', sans-serif",
    language: 'ar',
    previewText: 'دقة تقنية واضحة',
    tag: 'Arabic Editorial Tech',
  },
  {
    id: 'changa',
    name: 'Changa (تشانغا)',
    family: "'Changa', sans-serif",
    language: 'ar',
    previewText: 'عناوين بارزة وفيروسية',
    tag: 'Arabic Heavy Headline',
  },
  {
    id: 'amiri',
    name: 'Amiri (أميري)',
    family: "'Amiri', serif",
    language: 'ar',
    previewText: 'كن أنت التغيير المنشود',
    tag: 'Arabic Classical Naskh',
  },
  {
    id: 'el-messiri',
    name: 'El Messiri (المسيري)',
    family: "'El Messiri', sans-serif",
    language: 'ar',
    previewText: 'فخامة وسحر شرقي',
    tag: 'Arabic Elegant Serif',
  },
  {
    id: 'reem-kufi',
    name: 'Reem Kufi (ريم كوفي)',
    family: "'Reem Kufi', sans-serif",
    language: 'ar',
    previewText: 'أصالة التراث العربي',
    tag: 'Arabic Traditional Kufic',
  },
  {
    id: 'marhey',
    name: 'Marhey (مرحي)',
    family: "'Marhey', cursive",
    language: 'ar',
    previewText: 'طاقة وحيوية شبابية',
    tag: 'Arabic Friendly Casual',
  },
  {
    id: 'aref-ruqaa',
    name: 'Aref Ruqaa (عارف رقعة)',
    family: "'Aref Ruqaa', serif",
    language: 'ar',
    previewText: 'فن الرقعة العربي الأصيل',
    tag: 'Arabic Ruqaa Calligraphy',
  },
  {
    id: 'lalezar',
    name: 'Lalezar (لاله زار)',
    family: "'Lalezar', cursive",
    language: 'ar',
    previewText: 'حجم عريض للملصقات',
    tag: 'Arabic Ultra Poster',
  },
  {
    id: 'readex',
    name: 'Readex Pro',
    family: "'Readex Pro', sans-serif",
    language: 'ar',
    previewText: 'تصميم عالي الدقة',
    tag: 'Arabic Clean Tech',
  },
  {
    id: 'noto-arabic',
    name: 'Noto Sans Arabic',
    family: "'Noto Sans Arabic', sans-serif",
    language: 'ar',
    previewText: 'صوت واضح ومعبر',
    tag: 'Arabic Universal',
  },
  {
    id: 'katibeh',
    name: 'Katibeh (كتيبة)',
    family: "'Katibeh', cursive",
    language: 'ar',
    previewText: 'خط عربي رائع وكلاسيكي',
    tag: 'Arabic Persian Calligraphy',
  },
  {
    id: 'rakkas',
    name: 'Rakkas (رقاص)',
    family: "'Rakkas', display",
    language: 'ar',
    previewText: 'حروف لافتة وعريضة',
    tag: 'Arabic Headline Poster',
  },
  {
    id: 'scheherazade',
    name: 'Scheherazade New (شهرزاد)',
    family: "'Scheherazade New', serif",
    language: 'ar',
    previewText: 'رواية وقصص أصيلة',
    tag: 'Arabic Classical Story',
  },
  {
    id: 'mada',
    name: 'Mada (مدى)',
    family: "'Mada', sans-serif",
    language: 'ar',
    previewText: 'أفق جديد من الإبداع',
    tag: 'Arabic Modern Wide',
  },
  {
    id: 'mirza',
    name: 'Mirza (ميرزا)',
    family: "'Mirza', cursive",
    language: 'ar',
    previewText: 'رقة وانسيابية النسخ',
    tag: 'Arabic Soft Cursive',
  },
  {
    id: 'harmattan',
    name: 'Harmattan (هرمتان)',
    family: "'Harmattan', sans-serif",
    language: 'ar',
    previewText: 'بساطة وأصالة دافئة',
    tag: 'Arabic Clean Warm',
  },
  {
    id: 'lateef',
    name: 'Lateef (لطيف)',
    family: "'Lateef', cursive",
    language: 'ar',
    previewText: 'جمال الحروف اللطيفة',
    tag: 'Arabic Warm Flowing',
  },

  // English / Universal Fonts
  {
    id: 'montserrat',
    name: 'Montserrat Extra Bold',
    family: "'Montserrat', sans-serif",
    language: 'en',
    previewText: 'VIRAL SHORTS',
    tag: 'Punchy Viral',
  },
  {
    id: 'anton',
    name: 'Anton Impact',
    family: "'Anton', sans-serif",
    language: 'en',
    previewText: 'UNSTOPPABLE',
    tag: 'Tall & Heavy',
  },
  {
    id: 'bebas',
    name: 'Bebas Neue',
    family: "'Bebas Neue', cursive",
    language: 'en',
    previewText: 'DISCIPLINE WINS',
    tag: 'Clean Headline',
  },
  {
    id: 'outfit',
    name: 'Outfit Display',
    family: "'Outfit', sans-serif",
    language: 'all',
    previewText: 'Smart Aesthetics',
    tag: 'Modern Minimalist',
  },
  {
    id: 'bangers',
    name: 'Bangers Comic',
    family: "'Bangers', cursive",
    language: 'en',
    previewText: 'BOOM! EXPLOSIVE',
    tag: 'Gaming & Energy',
  },
];

export interface SubtitlePreset {
  id: string;
  name: string;
  description: string;
  style: Partial<SubtitleStyle>;
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: 'hormozi-yellow',
    name: 'Viral Hormozi Yellow',
    description: 'High energy uppercase with vibrant electric yellow word highlight',
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 34,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15', // vibrant yellow
      strokeColor: '#000000',
      strokeWidth: 6,
      shadow: true,
      shadowColor: 'rgba(0,0,0,0.9)',
      boxBackground: false,
      textCase: 'uppercase',
      animation: 'karaoke-bounce',
      wordsPerLine: 3,
      letterSpacing: 1,
    },
  },
  {
    id: 'arabic-gold',
    name: 'Arabic Royal Gold',
    description: 'Sophisticated Arabic calligraphy styling with luminous gold emphasis',
    style: {
      fontFamily: "'Cairo', sans-serif",
      fontSize: 36,
      textColor: '#FFFFFF',
      highlightColor: '#FBBF24',
      strokeColor: '#18181B',
      strokeWidth: 5,
      shadow: true,
      shadowColor: 'rgba(0,0,0,0.8)',
      boxBackground: true,
      boxColor: '#000000',
      boxOpacity: 0.55,
      textCase: 'none',
      animation: 'karaoke-bounce',
      wordsPerLine: 4,
      direction: 'rtl',
    },
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon Pulse',
    description: 'Cyan and neon green glow for gaming, tech, and fast clips',
    style: {
      fontFamily: "'Anton', sans-serif",
      fontSize: 36,
      textColor: '#E0F2FE',
      highlightColor: '#22C55E',
      strokeColor: '#082F49',
      strokeWidth: 5,
      shadow: true,
      shadowColor: '#06B6D4',
      boxBackground: false,
      textCase: 'uppercase',
      animation: 'karaoke-glow',
      wordsPerLine: 2,
    },
  },
  {
    id: 'netflix-modern',
    name: 'Netflix Modern Clean',
    description: 'Crisp sans-serif in a semi-transparent dark rounded box',
    style: {
      fontFamily: "'Outfit', sans-serif",
      fontSize: 28,
      textColor: '#FFFFFF',
      highlightColor: '#60A5FA',
      strokeColor: 'transparent',
      strokeWidth: 0,
      shadow: false,
      boxBackground: true,
      boxColor: '#09090B',
      boxOpacity: 0.75,
      textCase: 'none',
      animation: 'box-pop',
      wordsPerLine: 4,
    },
  },
  {
    id: 'red-punch',
    name: 'Crimson Impact',
    description: 'Bold red knockout captions for dramatic revelations and quotes',
    style: {
      fontFamily: "'Bebas Neue', cursive",
      fontSize: 40,
      textColor: '#FFFFFF',
      highlightColor: '#EF4444',
      strokeColor: '#000000',
      strokeWidth: 6,
      shadow: true,
      shadowColor: '#000000',
      boxBackground: false,
      textCase: 'uppercase',
      animation: 'karaoke-bounce',
      wordsPerLine: 3,
    },
  },
];

export interface PresetBackground {
  id: string;
  name: string;
  type: 'preset-video' | 'gradient';
  category: 'satisfying' | 'abstract' | 'gameplay' | 'cinematic';
  previewUrl: string;
  videoUrl?: string;
  gradient?: string;
}

export const PRESET_BACKGROUNDS: PresetBackground[] = [
  {
    id: 'bg-satisfying-loop',
    name: 'Kinetic Liquid Marble',
    type: 'preset-video',
    category: 'satisfying',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    id: 'bg-particles-drift',
    name: 'Deep Space Cosmic Drift',
    type: 'preset-video',
    category: 'cinematic',
    previewUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
  },
  {
    id: 'bg-neon-tunnel',
    name: 'Cyberpunk Grid Tunnel',
    type: 'preset-video',
    category: 'gameplay',
    previewUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
  },
  {
    id: 'bg-aurora-glow',
    name: 'Emerald Aurora Waves',
    type: 'preset-video',
    category: 'abstract',
    previewUrl: 'https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    id: 'bg-grad-dark',
    name: 'Obsidian Midnight Gradient',
    type: 'gradient',
    category: 'abstract',
    previewUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=800&q=80',
    gradient: 'linear-gradient(135deg, #09090b 0%, #18181b 50%, #030712 100%)',
  },
  {
    id: 'bg-grad-sunset',
    name: 'Twilight Violet Aura',
    type: 'gradient',
    category: 'abstract',
    previewUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    gradient: 'linear-gradient(180deg, #1e1b4b 0%, #0f172a 60%, #020617 100%)',
  },
];

export interface PresetAudioTrack {
  id: string;
  name: string;
  author: string;
  language: 'en' | 'ar';
  duration: number;
  audioUrl: string;
  description: string;
  defaultSubtitles: SubtitleCue[];
}

export const PRESET_AUDIO_TRACKS: PresetAudioTrack[] = [
  {
    id: 'audio-english-motivation',
    name: 'The Relentless Mindset',
    author: 'Visionary Speech',
    language: 'en',
    duration: 22.5,
    audioUrl: 'https://actions.google.com/sounds/v1/ambiences/humming_room_tone.ogg', // clean ambient bed
    description: 'High impact inspirational speech clip in English with word-by-word timestamps',
    defaultSubtitles: [
      {
        id: 'c1',
        start: 0.5,
        end: 3.2,
        text: 'Great things take relentless focus',
        words: [
          { word: 'Great', start: 0.5, end: 1.1 },
          { word: 'things', start: 1.1, end: 1.7 },
          { word: 'take', start: 1.7, end: 2.2 },
          { word: 'relentless', start: 2.2, end: 2.8 },
          { word: 'focus', start: 2.8, end: 3.2 },
        ],
      },
      {
        id: 'c2',
        start: 3.6,
        end: 6.8,
        text: 'You cannot climb the ladder with your hands in your pockets',
        words: [
          { word: 'You', start: 3.6, end: 4.0 },
          { word: 'cannot', start: 4.0, end: 4.5 },
          { word: 'climb', start: 4.5, end: 5.0 },
          { word: 'the', start: 5.0, end: 5.3 },
          { word: 'ladder', start: 5.3, end: 5.8 },
          { word: 'with', start: 5.8, end: 6.1 },
          { word: 'hands', start: 6.1, end: 6.5 },
          { word: 'ready', start: 6.5, end: 6.8 },
        ],
      },
      {
        id: 'c3',
        start: 7.2,
        end: 11.0,
        text: 'Every single failure brings you one step closer',
        words: [
          { word: 'Every', start: 7.2, end: 7.7 },
          { word: 'single', start: 7.7, end: 8.3 },
          { word: 'failure', start: 8.3, end: 9.1 },
          { word: 'brings', start: 9.1, end: 9.7 },
          { word: 'you', start: 9.7, end: 10.0 },
          { word: 'one', start: 10.0, end: 10.3 },
          { word: 'step', start: 10.3, end: 10.6 },
          { word: 'closer', start: 10.6, end: 11.0 },
        ],
      },
      {
        id: 'c4',
        start: 11.5,
        end: 15.6,
        text: 'Stay hungry and never ever surrender',
        words: [
          { word: 'Stay', start: 11.5, end: 12.2 },
          { word: 'hungry', start: 12.2, end: 13.1 },
          { word: 'and', start: 13.1, end: 13.5 },
          { word: 'never', start: 13.5, end: 14.2 },
          { word: 'ever', start: 14.2, end: 14.8 },
          { word: 'surrender', start: 14.8, end: 15.6 },
        ],
      },
      {
        id: 'c5',
        start: 16.0,
        end: 21.5,
        text: 'Your future is being created right now',
        words: [
          { word: 'Your', start: 16.0, end: 16.7 },
          { word: 'future', start: 16.7, end: 17.6 },
          { word: 'is', start: 17.6, end: 18.0 },
          { word: 'being', start: 18.0, end: 18.6 },
          { word: 'created', start: 18.6, end: 19.5 },
          { word: 'right', start: 19.5, end: 20.2 },
          { word: 'now', start: 20.2, end: 21.5 },
        ],
      },
    ],
  },
  {
    id: 'audio-arabic-wisdom',
    name: 'حكمة الإصرار والنجاح (Wisdom & Resolve)',
    author: 'كلمات ملهمة (Inspiring Talk)',
    language: 'ar',
    duration: 23.0,
    audioUrl: 'https://actions.google.com/sounds/v1/ambiences/warm_breeze.ogg',
    description: 'مقطع عربي ملهم مع توقيتات دقيقة باللغة العربية وترتيب الحروف الأصيل',
    defaultSubtitles: [
      {
        id: 'ar1',
        start: 0.5,
        end: 3.5,
        text: 'النجاح ليس صدفة بل قرار تتخذه يومياً',
        words: [
          { word: 'النجاح', start: 0.5, end: 1.2 },
          { word: 'ليس', start: 1.2, end: 1.7 },
          { word: 'صدفة', start: 1.7, end: 2.3 },
          { word: 'بل', start: 2.3, end: 2.6 },
          { word: 'قرار', start: 2.6, end: 3.0 },
          { word: 'تتخذه', start: 3.0, end: 3.5 },
        ],
      },
      {
        id: 'ar2',
        start: 4.0,
        end: 7.8,
        text: 'مهما كانت التحديات أمامك، قوتك في استمرارك',
        words: [
          { word: 'مهما', start: 4.0, end: 4.6 },
          { word: 'كانت', start: 4.6, end: 5.1 },
          { word: 'التحديات', start: 5.1, end: 6.0 },
          { word: 'أمامك', start: 6.0, end: 6.7 },
          { word: 'قوتك', start: 6.7, end: 7.2 },
          { word: 'في', start: 7.2, end: 7.5 },
          { word: 'استمرارك', start: 7.5, end: 7.8 },
        ],
      },
      {
        id: 'ar3',
        start: 8.3,
        end: 12.5,
        text: 'كل خطوة صغيرة تقربك من قمة طموحك',
        words: [
          { word: 'كل', start: 8.3, end: 8.8 },
          { word: 'خطوة', start: 8.8, end: 9.4 },
          { word: 'صغيرة', start: 9.4, end: 10.2 },
          { word: 'تقربك', start: 10.2, end: 11.0 },
          { word: 'من', start: 11.0, end: 11.3 },
          { word: 'قمة', start: 11.3, end: 11.8 },
          { word: 'طموحك', start: 11.8, end: 12.5 },
        ],
      },
      {
        id: 'ar4',
        start: 13.0,
        end: 17.5,
        text: 'لا تدع الشك يسرق منك شغفك وهدفك',
        words: [
          { word: 'لا', start: 13.0, end: 13.5 },
          { word: 'تدع', start: 13.5, end: 14.1 },
          { word: 'الشك', start: 14.1, end: 14.9 },
          { word: 'يسرق', start: 14.9, end: 15.6 },
          { word: 'منك', start: 15.6, end: 16.1 },
          { word: 'شغفك', start: 16.1, end: 16.8 },
          { word: 'وهدفك', start: 16.8, end: 17.5 },
        ],
      },
      {
        id: 'ar5',
        start: 18.0,
        end: 22.5,
        text: 'كن شجاعاً، فالمستقبل ينتظر بصمتك',
        words: [
          { word: 'كن', start: 18.0, end: 18.5 },
          { word: 'شجاعاً', start: 18.5, end: 19.5 },
          { word: 'فالمستقبل', start: 19.5, end: 20.6 },
          { word: 'ينتظر', start: 20.6, end: 21.5 },
          { word: 'بصمتك', start: 21.5, end: 22.5 },
        ],
      },
    ],
  },
];

/**
 * Resolution dimensions map for aspect ratios
 */
export function getResolutionDimensions(
  aspectRatio: AspectRatio,
  resolution: ExportResolution
): { width: number; height: number } {
  // Base heights/widths
  switch (resolution) {
    case '4k': // 2160p
      if (aspectRatio === '9:16') return { width: 2160, height: 3840 };
      if (aspectRatio === '16:9') return { width: 3840, height: 2160 };
      if (aspectRatio === '1:1') return { width: 2160, height: 2160 };
      return { width: 2160, height: 2700 }; // 4:5

    case '1440p': // 2K
      if (aspectRatio === '9:16') return { width: 1440, height: 2560 };
      if (aspectRatio === '16:9') return { width: 2560, height: 1440 };
      if (aspectRatio === '1:1') return { width: 1440, height: 1440 };
      return { width: 1440, height: 1800 };

    case '1080p': // Full HD
      if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
      if (aspectRatio === '16:9') return { width: 1920, height: 1080 };
      if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
      return { width: 1080, height: 1350 };

    case '720p': // HD
    default:
      if (aspectRatio === '9:16') return { width: 720, height: 1280 };
      if (aspectRatio === '16:9') return { width: 1280, height: 720 };
      if (aspectRatio === '1:1') return { width: 720, height: 720 };
      return { width: 720, height: 900 };
  }
}
